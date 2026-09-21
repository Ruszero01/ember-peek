//! File composition: match all contributors, select one contract source, retain their independent state.
use super::*;

impl Runtime {
    pub async fn open(self: &Arc<Self>, path: PathBuf) -> Result<SessionInfo, String> {
        let path = tokio::fs::canonicalize(path)
            .await
            .map_err(|e| msg!(text().open_failed, error = e))?;
        let metadata = tokio::fs::metadata(&path)
            .await
            .map_err(|e| e.to_string())?;
        if !metadata.is_file() {
            return Err(msg!(text().pick_file));
        }
        let extension = path
            .extension()
            .and_then(|s| s.to_str())
            .unwrap_or("")
            .to_lowercase();
        let mut inner = self.inner.lock().await;
        if inner.updating {
            return Err(msg!(text().updating));
        }
        let mut packages: Vec<_> = inner
            .packages
            .values()
            .filter(|p| {
                !inner.disabled.contains(&p.manifest.id)
                    && p.tool.is_none()
                    && (p.manifest.matches(&extension)
                        || path
                            .file_name()
                            .and_then(|name| name.to_str())
                            .is_some_and(|name| {
                                p.manifest
                                    .file_names
                                    .iter()
                                    .any(|candidate| candidate.eq_ignore_ascii_case(name))
                            }))
            })
            .cloned()
            .collect();
        for package in &mut packages {
            if let Some(activation) = inner.activation.get(&package.manifest.id) {
                package.manifest.activation = activation.clone();
            }
        }
        packages.sort_by(|a, b| {
            b.manifest
                .activation
                .priority
                .cmp(&a.manifest.activation.priority)
                .then(a.manifest.id.cmp(&b.manifest.id))
        });
        if packages.is_empty() {
            return Err(msg!(text().unsupported_extension, extension = extension));
        }
        if packages.len() > 32 {
            return Err(msg!(text().too_many_per_file));
        }
        let stamp = metadata
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let revisions: Vec<_> = packages.iter().map(Package::key).collect();
        let cache_key = json!([path, metadata.len(), stamp, revisions]).to_string();
        let preferred = inner.preferred.get(&extension).cloned();
        let source_index = packages.iter().position(|p| p.manifest.provides.is_some());
        let automatic = packages.iter().position(|p| {
            p.manifest.has(Capability::View) && p.manifest.activation.mode == ActivationMode::Auto
        });
        let preferred_index = packages.iter().position(|p| {
            Some(&p.manifest.id) == preferred.as_ref()
                && p.manifest.has(Capability::View)
                && (automatic.is_none() || p.manifest.activation.mode == ActivationMode::Auto)
        });
        let selected_index = preferred_index
            .or(automatic)
            .or_else(|| {
                packages
                    .iter()
                    .position(|p| p.manifest.has(Capability::View))
            })
            .unwrap_or(0);
        if let Some(existing) = inner.sessions.values().find(|s| {
            s.data["cacheKey"] == cache_key
                && s.info.status != "error"
                && s.info.plugin_id == packages[selected_index].manifest.id
        }) {
            let file_id = existing.info.file_id.clone();
            for session in inner
                .sessions
                .values_mut()
                .filter(|s| s.info.file_id == file_id)
            {
                session.touched = Instant::now();
            }
            if let Some(selected) = inner.sessions.values().find(|s| {
                s.info.file_id == file_id
                    && s.info.plugin_id == packages[selected_index].manifest.id
            }) {
                return Ok(selected.info.clone());
            }
        }
        // A completed save invalidates a clean revision. Retire that revision before
        // admitting its replacement, so repeated saves cannot consume all file slots.
        // Busy calls and drafts keep their entire dependency group intact.
        let invalid: HashSet<_> = inner
            .sessions
            .values()
            .filter(|s| s.data["cacheKey"].is_null())
            .map(|s| s.info.file_id.clone())
            .collect();
        let removable: HashSet<_> = invalid
            .into_iter()
            .filter(|file| {
                inner
                    .sessions
                    .values()
                    .filter(|s| &s.info.file_id == file)
                    .all(|s| s.calls == 0 && !s.info.pending)
            })
            .collect();
        let ids_to_remove: Vec<_> = inner
            .sessions
            .values()
            .filter(|s| removable.contains(&s.info.file_id))
            .map(|s| s.info.id.clone())
            .collect();
        for id in ids_to_remove {
            if let Some(session) = inner.sessions.remove(&id) {
                if let Some(worker) = inner.workers.get(&session.package.key()).cloned() {
                    tokio::spawn(async move {
                        let _ = worker.release(json!({"session":id})).await;
                    });
                }
            }
        }
        if inner
            .sessions
            .values()
            .map(|s| &s.info.file_id)
            .collect::<HashSet<_>>()
            .len()
            >= MAX_SESSIONS
        {
            return Err(msg!(text().too_many_sessions));
        }
        if inner.sessions.len() + packages.len() > 64 {
            return Err(msg!(text().too_many_instances));
        }
        let file_id = format!("f{}", self.sequence.fetch_add(1, Ordering::Relaxed));
        let ids: Vec<_> = (0..packages.len())
            .map(|_| format!("s{}", self.sequence.fetch_add(1, Ordering::Relaxed)))
            .collect();
        let contract = source_index.and_then(|i| packages[i].manifest.provides.clone());
        let mut jobs = Vec::new();
        for (index, package) in packages.iter().enumerate() {
            let source = if Some(index) != source_index
                && (package.manifest.consumes.is_some() || package.manifest.provides.is_some())
            {
                source_index.map(|i| ids[i].clone())
            } else {
                None
            };
            let required = package
                .manifest
                .consumes
                .as_ref()
                .or(package.manifest.provides.as_ref());
            let error = required
                .filter(|required| Some(*required) != contract.as_ref())
                .map(|required| {
                    msg!(
                        text().missing_source,
                        contract = required,
                        current = contract.as_deref().unwrap_or(text().shape_unknown)
                    )
                });
            let info = SessionInfo {
                id: ids[index].clone(),
                file_id: file_id.clone(),
                plugin_id: package.manifest.id.clone(),
                // The declared name. What the interface shows is refreshed from the
                // localized declaration by every snapshot, so a language change reaches a
                // session that is already open.
                label: package.manifest.name.clone(),
                revision: package.manifest.revision,
                entry: package.manifest.entry.clone(),
                capabilities: package.manifest.capabilities.clone(),
                overlay: package.manifest.overlay.clone(),
                available: true,
                pending: false,
                pending_reason: None,
                name: path.file_name().unwrap().to_string_lossy().into(),
                size: metadata.len(),
                status: if error.is_some() { "error" } else { "loading" }.into(),
                view_ready: false,
                error: error.clone(),
            };
            let empty = serde_json::Map::new();
            let settings = package
                .manifest
                .resolve_settings(inner.settings.get(&package.manifest.id).unwrap_or(&empty));
            let worker = inner
                .workers
                .entry(package.key())
                .or_insert_with(|| Arc::new(Worker::new(package.clone())))
                .clone();
            inner.sessions.insert(
                ids[index].clone(),
                Session {
                    info,
                    path: path.clone(),
                    package: package.clone(),
                    data: json!({"cacheKey":cache_key}),
                    touched: Instant::now(),
                    calls: usize::from(error.is_none()),
                    source: source.clone(),
                },
            );
            if error.is_none() {
                jobs.push((
                    index,
                    ids[index].clone(),
                    worker,
                    json!({"session":ids[index],"fileSession":file_id,"path":path,
                    "settings":settings,"defaults":package.manifest.default_settings(),
                    "source":source.map(|id| json!({"id":id,"contract":contract}))}),
                ));
            }
        }
        let info = inner.sessions[&ids[selected_index]].info.clone();
        drop(inner);
        let runtime = self.clone();
        // One runtime-owned pipeline per file. Caller cancellation and viewport switches cannot cancel it.
        tokio::spawn(async move {
            // File tools with no source dependency start immediately, even if a large parser is busy.
            let mut index = 0;
            while index < jobs.len() {
                if Some(jobs[index].0) != source_index && jobs[index].3["source"].is_null() {
                    let (_, id, worker, params) = jobs.remove(index);
                    let runtime = runtime.clone();
                    tokio::spawn(async move {
                        runtime.opened(&id, worker.call("open", params).await).await;
                    });
                } else {
                    index += 1;
                }
            }
            let source_result =
                if let Some(position) = jobs.iter().position(|job| Some(job.0) == source_index) {
                    let (_, id, worker, params) = jobs.remove(position);
                    let result = worker.call("open", params).await;
                    let outcome = result.as_ref().map(|_| ()).map_err(Clone::clone);
                    runtime.opened(&id, result).await;
                    outcome
                } else {
                    Ok(())
                };
            for (_, id, worker, params) in jobs {
                let runtime = runtime.clone();
                let dependency = if params["source"].is_null() {
                    Ok(())
                } else {
                    source_result.clone()
                };
                tokio::spawn(async move {
                    let result = match dependency {
                        Ok(()) => worker.call("open", params).await,
                        Err(error) => Err(msg!(text().source_failed, error = error)),
                    };
                    runtime.opened(&id, result).await;
                });
            }
        });
        Ok(info)
    }

    async fn opened(&self, id: &str, result: Result<Value, String>) {
        let mut inner = self.inner.lock().await;
        if let Some(session) = inner.sessions.get_mut(id) {
            session.calls -= 1;
            session.touched = Instant::now();
            match result {
                Ok(data) => {
                    session.info.status = "ready".into();
                    session.data["result"] = data;
                }
                Err(error) => {
                    session.info.status = "error".into();
                    session.info.error = Some(error);
                }
            }
        }
    }

    pub async fn activate(&self, id: Option<String>) -> Result<(), String> {
        let mut inner = self.inner.lock().await;
        let next_file = if let Some(id) = &id {
            let session = inner
                .sessions
                .get(id)
                .ok_or_else(|| msg!(text().session_expired))?;
            if inner.disabled.contains(&session.info.plugin_id)
                || !inner.packages.contains_key(&session.info.plugin_id)
            {
                return Err(msg!(text().plugin_disabled));
            }
            let file_id = session.info.file_id.clone();
            if session.package.manifest.has(Capability::View) {
                let extension = session
                    .path
                    .extension()
                    .and_then(|s| s.to_str())
                    .unwrap_or("")
                    .to_lowercase();
                let plugin = session.info.plugin_id.clone();
                inner.preferred.insert(extension, plugin);
                self.persist(&inner)?;
            }
            Some(file_id)
        } else {
            None
        };
        let previous_file = inner
            .active
            .as_ref()
            .and_then(|id| inner.sessions.get(id))
            .map(|s| s.info.file_id.clone());
        for session in inner.sessions.values_mut() {
            if Some(&session.info.file_id) == previous_file.as_ref()
                || Some(&session.info.file_id) == next_file.as_ref()
            {
                session.touched = Instant::now();
            }
        }
        inner.active = id;
        Ok(())
    }

    pub async fn return_target(&self, id: &str) -> Result<String, String> {
        let inner = self.inner.lock().await;
        let session = inner
            .sessions
            .get(id)
            .ok_or_else(|| msg!(text().session_expired))?;
        let available = |s: &&Session| {
            s.info.file_id == session.info.file_id
                && s.package.manifest.has(Capability::View)
                && !inner.disabled.contains(&s.info.plugin_id)
                && inner.packages.contains_key(&s.info.plugin_id)
        };
        Ok(inner
            .sessions
            .values()
            .filter(available)
            .min_by_key(|s| {
                (
                    s.package.manifest.activation.mode != ActivationMode::Auto,
                    Some(&s.info.id) != session.source.as_ref(),
                    s.package.manifest.provides.is_none(),
                    s.info.id == id,
                    &s.info.id,
                )
            })
            .map(|s| s.info.id.clone())
            .unwrap_or_else(|| id.to_owned()))
    }

    pub async fn source_data(&self, id: &str) -> Result<Value, String> {
        let inner = self.inner.lock().await;
        let session = inner
            .sessions
            .get(id)
            .ok_or_else(|| msg!(text().session_expired))?;
        let Some(source) = session
            .source
            .as_ref()
            .and_then(|id| inner.sessions.get(id))
        else {
            return Ok(Value::Null);
        };
        if source.info.status != "ready" {
            return Err("Source is not ready".into());
        }
        Ok(json!({"contract":source.package.manifest.provides,"data":source.data["result"]}))
    }
}
