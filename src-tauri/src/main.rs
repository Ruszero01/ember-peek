#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod capture;
mod credentials;
mod desktop;
#[cfg(windows)]
mod explorer;
mod framing;
mod icons;
mod libraries;
mod local_packages;
mod model_catalog;
mod network;
mod public_http;
mod resource;
mod updates;
mod workshop;

use base64::Engine;
use ember_runtime::i18n::text;
use ember_runtime::manifest::{Activation, Permission};
use ember_runtime::market::{read_sources, Market, MarketList, Source};
use ember_runtime::{Runtime, Snapshot};
use serde_json::Value;
use std::{
    path::{Path, PathBuf},
    sync::Arc,
};
use tauri::{Manager, State};
use tokio::io::{AsyncReadExt, AsyncSeekExt};

type Host<'a> = State<'a, Arc<Runtime>>;

/// The windows a workshop self-check runs in. The workshop owns the task and the state
/// machine; only the app can open a window, photograph it and close it again.
struct AppWindows {
    app: tauri::AppHandle,
}
impl workshop::ProbeWindows for AppWindows {
    fn show(
        &self,
        window: workshop::ProbeWindow,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>> {
        let app = self.app.clone();
        Box::pin(async move {
            if let Some(existing) = app.get_webview_window(&window.label) {
                // A probe window left over from an interrupted run is reused, not stacked.
                existing
                    .navigate(window.url.parse().map_err(|e| format!("{e:?}"))?)
                    .map_err(|e| e.to_string())?;
                existing.show().map_err(|e| e.to_string())?;
                return Ok(());
            }
            // Building a window is not async, and it must not run on the async worker.
            tauri::async_runtime::spawn_blocking(move || {
                let builder = tauri::WebviewWindowBuilder::new(
                    &app,
                    window.label,
                    tauri::WebviewUrl::App(window.url.into()),
                )
                .title(window.title)
                .inner_size(1000.0, 720.0)
                .min_inner_size(640.0, 440.0)
                .center();
                let builder = match desktop::browser_args() {
                    Some(args) => builder.additional_browser_args(&args),
                    None => builder,
                };
                builder.build().map_err(|e| e.to_string()).map(|_| ())
            })
            .await
            .map_err(|e| e.to_string())?
        })
    }
    fn capture(
        &self,
        label: String,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Vec<u8>, String>> + Send>> {
        let app = self.app.clone();
        Box::pin(async move {
            let window = app
                .get_webview_window(&label)
                .ok_or("试运行窗口已经关闭，无法截图")?;
            capture::png(&window).await
        })
    }
    fn close(
        &self,
        label: String,
    ) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<(), String>> + Send>> {
        let app = self.app.clone();
        Box::pin(async move {
            if let Some(window) = app.get_webview_window(&label) {
                window.close().map_err(|e| e.to_string())?;
            }
            Ok(())
        })
    }
}

#[tauri::command]
async fn open_workshop(
    app: tauri::AppHandle,
    host: Host<'_>,
    service: State<'_, Arc<workshop::Workshop>>,
) -> Result<(), String> {
    let installed = host.snapshot().await.plugins.into_iter().find(|p| {
        p.enabled
            && p.tool.as_ref().is_some_and(|t| t.service == "workshop")
            && p.origin == "official"
    });
    let Some(tool) = installed else {
        return desktop::show_settings(app, Some("plugins".into()));
    };
    if let Some(path) = desktop::last_path(&app) {
        service.create(String::new(), Some(path)).await?;
    }
    desktop::show_settings(app, Some(format!("tool:{}", tool.manifest.id)))
}

#[tauri::command]
fn icon_data(name: Option<String>, query: Option<String>) -> Value {
    if let Some(name) = name {
        Value::String(icons::svg(&name))
    } else {
        serde_json::json!(icons::names(query.as_deref().unwrap_or_default()))
    }
}

#[tauri::command]
async fn tool_call(
    app: tauri::AppHandle,
    window: tauri::Window,
    host: Host<'_>,
    service: State<'_, Arc<workshop::Workshop>>,
    id: String,
    method: String,
    params: Value,
) -> Result<Value, String> {
    let tool = host.tool_package(&id).await?;
    let project = params["id"].as_str().unwrap_or_default();
    match method.as_str() {
        // Plugin management is the source of truth for what is installed; a task that was
        // removed there must not keep claiming an installed version.
        "state" => {
            service.reconcile(host.inner()).await?;
            Ok(service.state().await)
        }
        "artifacts" => service.artifacts(project).await,
        "delete" => {
            let uninstall = params["uninstall"].as_bool() == Some(true);
            service.delete(project, uninstall, host.inner()).await?;
            // A preview window whose task is gone would only ever show a broken page.
            let prefix = format!("workshop-preview-{project}-");
            for (label, window) in app.webview_windows() {
                if label.starts_with(&prefix) {
                    let _ = window.close();
                }
            }
            Ok(Value::Null)
        }
        "catalog" => Ok(model_catalog::catalog()),
        "icons" => Ok(icon_data(
            params["name"].as_str().map(str::to_owned),
            params["query"].as_str().map(str::to_owned),
        )),
        "saveProvider" => {
            let config =
                serde_json::from_value(params["config"].clone()).map_err(|e| e.to_string())?;
            service
                .save_provider(config, params["key"].as_str().map(str::to_owned), false)
                .await?;
            Ok(Value::Null)
        }
        "selectModel" => {
            service
                .select_model(
                    params["providerId"].as_str().ok_or("Missing provider ID")?,
                    params["model"].as_str().ok_or("Missing model")?,
                )
                .await?;
            Ok(Value::Null)
        }
        "configure" => {
            let config =
                serde_json::from_value(params["config"].clone()).map_err(|e| e.to_string())?;
            service
                .configure(config, params["key"].as_str().map(str::to_owned))
                .await?;
            Ok(Value::Null)
        }
        "testProvider" => {
            let config =
                serde_json::from_value(params["config"].clone()).map_err(|e| e.to_string())?;
            service
                .test_provider(config, params["key"].as_str().map(str::to_owned))
                .await?;
            Ok(Value::Null)
        }
        "testConnection" => {
            service.test_connection().await?;
            Ok(Value::Null)
        }
        "selectProvider" => {
            service
                .select_provider(params["providerId"].as_str().ok_or("Missing provider ID")?)
                .await?;
            Ok(Value::Null)
        }
        "removeProvider" => {
            service
                .remove_provider(params["providerId"].as_str().ok_or("Missing provider ID")?)
                .await?;
            Ok(Value::Null)
        }
        // The general web engine the agent's lookups use. A key is stored in the system
        // credential store, and only what is not a secret comes back to the page.
        "searchSettings" => {
            let engine = service.search_setting();
            Ok(serde_json::json!({
                "provider": engine.provider,
                "endpoint": engine.endpoint,
                "results": engine.results,
                "hasKey": engine.key.is_some(),
            }))
        }
        "configureSearch" => {
            let engine =
                serde_json::from_value(params["config"].clone()).map_err(|e| e.to_string())?;
            service.configure_search(engine, params["clearKey"].as_bool() == Some(true))?;
            Ok(Value::Null)
        }
        "models" => Ok(serde_json::json!(service.models().await?)),
        "modelsDraft" => {
            let config =
                serde_json::from_value(params["config"].clone()).map_err(|e| e.to_string())?;
            Ok(serde_json::json!(
                service
                    .models_for(config, params["key"].as_str().map(str::to_owned))
                    .await?
            ))
        }
        "selectSample" => {
            let path = tauri::async_runtime::spawn_blocking(move || {
                rfd::FileDialog::new().set_parent(&window).pick_file()
            })
            .await
            .map_err(|e| e.to_string())?;
            if let Some(path) = path {
                service.attach_sample(project, path).await?;
            }
            Ok(Value::Null)
        }
        "addAttachments" => {
            let paths = tauri::async_runtime::spawn_blocking(move || {
                rfd::FileDialog::new().set_parent(&window).pick_files()
            })
            .await
            .map_err(|e| e.to_string())?;
            if let Some(paths) = paths {
                service.attach_files(project, paths).await?;
            }
            Ok(Value::Null)
        }
        "addPaths" => {
            let paths = params["paths"]
                .as_array()
                .ok_or("Missing attachment paths")?
                .iter()
                .filter_map(|value| value.as_str())
                .map(std::path::PathBuf::from)
                .collect();
            service.attach_files(project, paths).await?;
            Ok(Value::Null)
        }
        "create" => {
            let sample = if params["withSample"].as_bool() == Some(true) {
                let sample = tauri::async_runtime::spawn_blocking(move || {
                    rfd::FileDialog::new().set_parent(&window).pick_file()
                })
                .await
                .map_err(|e| e.to_string())?;
                if sample.is_none() {
                    return Ok(Value::Null);
                }
                sample
            } else {
                None
            };
            Ok(serde_json::to_value(
                service
                    .create(
                        params["requirement"].as_str().unwrap_or_default().into(),
                        sample,
                    )
                    .await?,
            )
            .map_err(|e| e.to_string())?)
        }
        "createPath" => {
            let path = params["path"].as_str().ok_or("Missing sample path")?;
            Ok(serde_json::to_value(
                service
                    .create(
                        params["requirement"].as_str().unwrap_or_default().into(),
                        Some(std::path::PathBuf::from(path)),
                    )
                    .await?,
            )
            .map_err(|e| e.to_string())?)
        }
        "start" | "analyze" => {
            service
                .inner()
                .start(
                    project.into(),
                    params["message"].as_str().unwrap_or_default().into(),
                    tool,
                    method == "analyze",
                )
                .await?;
            Ok(Value::Null)
        }
        "cancel" => {
            service.cancel(project).await?;
            Ok(Value::Null)
        }
        "openPreview" => {
            let candidate = service.get(project).await?;
            if candidate.version == 0 || candidate.sample.is_none() {
                return Err("请先构建插件并选择样例文件".into());
            }
            let label = format!("workshop-preview-{}-{}", candidate.id, candidate.version);
            if let Some(existing) = app.get_webview_window(&label) {
                existing
                    .eval("location.reload()")
                    .map_err(|e| e.to_string())?;
                existing.show().map_err(|e| e.to_string())?;
                existing.set_focus().map_err(|e| e.to_string())?;
            } else {
                let url = format!("index.html?workshopPreview={}&tool={id}", candidate.id);
                tauri::async_runtime::spawn_blocking(move || {
                    let builder = tauri::WebviewWindowBuilder::new(
                        &app,
                        label,
                        tauri::WebviewUrl::App(url.into()),
                    )
                    .title(format!("{} · 试预览", candidate.name))
                    .inner_size(1000.0, 720.0)
                    .min_inner_size(640.0, 440.0)
                    .center();
                    let builder = match desktop::browser_args() {
                        Some(args) => builder.additional_browser_args(&args),
                        None => builder,
                    };
                    builder.build().map_err(|e| e.to_string())
                })
                .await
                .map_err(|e| e.to_string())??;
            }
            Ok(Value::Null)
        }
        "preview" => {
            let project = service.begin_preview(project).await?;
            let metadata = match &project.sample {
                Some(path) => Some(tokio::fs::metadata(path).await.map_err(|e| e.to_string())?),
                None => None,
            };
            Ok(
                serde_json::json!({"id":project.id,"version":project.version,"token":project.preview_token,"file":{"name":project.sample.as_ref().and_then(|p| Path::new(p).file_name()).map(|s| s.to_string_lossy().into_owned()).unwrap_or_default(),"size":metadata.map(|m| m.len()).unwrap_or(0)}}),
            )
        }
        "readSample" => Ok(Value::String(
            base64::engine::general_purpose::STANDARD.encode(
                service
                    .read_sample(
                        project,
                        params["offset"].as_u64().ok_or("Invalid offset")?,
                        params["length"]
                            .as_u64()
                            .filter(|n| *n <= 1048576)
                            .ok_or("Invalid length")? as u32,
                    )
                    .await?,
            ),
        )),
        "presented" => {
            let logs = params["logs"]
                .as_array()
                .map(|lines| {
                    lines
                        .iter()
                        .filter_map(Value::as_str)
                        .take(20)
                        .map(str::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            service
                .presented(
                    project,
                    params["version"].as_u64().ok_or("Missing build version")?,
                    params["token"].as_str().ok_or("Missing preview session")?,
                    params["error"].as_str().map(str::to_owned),
                    logs,
                )
                .await?;
            Ok(Value::Null)
        }
        "install" => {
            let sample = service.get(project).await?.sample.map(PathBuf::from);
            service.install(project, host.inner()).await?;
            if let Some(sample) = sample {
                if desktop::last_path(&app).is_none_or(|current| current == sample) {
                    desktop::open(&app, sample).await?;
                }
            }
            Ok(Value::Null)
        }
        "restore" => {
            service.restore(project).await?;
            Ok(Value::Null)
        }
        "export" => {
            let bytes = service.export(project).await?;
            Ok(serde_json::to_value(
                save_workshop_package(window, format!("user.{project}"), bytes).await?,
            )
            .map_err(|e| e.to_string())?)
        }
        "openSample" => {
            let p = service.get(project).await?;
            desktop::open(&app, PathBuf::from(p.sample.ok_or("No sample selected")?)).await?;
            Ok(Value::Null)
        }
        _ => Err("Unknown tool service method".into()),
    }
}

#[tauri::command]
async fn view_state(
    host: Host<'_>,
    id: String,
    value: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    host.view_state(&id, value).await
}

#[tauri::command]
async fn market_list(host: Host<'_>, market: State<'_, Market>) -> Result<MarketList, String> {
    market.list(host.inner()).await
}

#[tauri::command]
async fn market_refresh(host: Host<'_>, market: State<'_, Market>) -> Result<MarketList, String> {
    market.refresh(host.inner()).await
}

#[tauri::command]
async fn market_prepare(market: State<'_, Market>, id: String) -> Result<String, String> {
    Ok(market.prepare(&id).await?.to_string_lossy().into_owned())
}

#[tauri::command]
async fn market_install(
    host: Host<'_>,
    market: State<'_, Market>,
    id: String,
) -> Result<(), String> {
    market.install(host.inner(), &id).await
}

#[tauri::command]
async fn snapshot(host: Host<'_>) -> Result<Snapshot, String> {
    Ok(host.snapshot().await)
}

#[tauri::command]
async fn complete_onboarding(host: Host<'_>) -> Result<(), String> {
    host.complete_onboarding().await
}

#[tauri::command]
async fn refresh_plugins(host: Host<'_>) -> Result<(), String> {
    host.scan().await
}

#[tauri::command]
async fn open_file(app: tauri::AppHandle, path: String) -> Result<(), String> {
    desktop::open(&app, PathBuf::from(path)).await
}

#[tauri::command]
async fn session_data(host: Host<'_>, id: String) -> Result<Value, String> {
    host.session_data(&id).await
}

#[tauri::command]
async fn source_data(host: Host<'_>, id: String) -> Result<Value, String> {
    host.source_data(&id).await
}
#[tauri::command]
async fn source_call(
    host: Host<'_>,
    id: String,
    method: String,
    value: Value,
) -> Result<Value, String> {
    host.source_call(&id, &method, value).await
}
#[tauri::command]
async fn set_pending(
    host: Host<'_>,
    id: String,
    pending: bool,
    reason: Option<String>,
) -> Result<(), String> {
    host.set_pending(&id, pending, reason).await
}
#[tauri::command]
async fn plugin_mutate(
    host: Host<'_>,
    id: String,
    method: String,
    value: Value,
) -> Result<Value, String> {
    host.authorize(&id, Permission::WriteFile).await?;
    host.call(&id, &method, value).await
}
#[tauri::command]
async fn authorize_clipboard(host: Host<'_>, id: String) -> Result<(), String> {
    host.authorize(&id, Permission::Clipboard).await
}
/// Hand a link the user clicked to the system. The plugin page is sandboxed and cannot navigate
/// or open anything itself, so a document's link arrives here as text, and what may be opened is
/// decided on the native side before the shell sees it.
#[tauri::command]
async fn open_link(host: Host<'_>, id: String, url: String) -> Result<(), String> {
    host.authorize(&id, Permission::OpenLink).await?;
    desktop::open_external_url(&url)
}
#[tauri::command]
async fn file_changed(
    app: tauri::AppHandle,
    id: String,
    return_to_source: bool,
) -> Result<(), String> {
    app.state::<Arc<Runtime>>()
        .authorize(&id, Permission::WriteFile)
        .await?;
    desktop::refresh_file(&app, &id, return_to_source).await
}

#[tauri::command]
async fn complete_view(
    app: tauri::AppHandle,
    host: Host<'_>,
    id: String,
    error: Option<String>,
) -> Result<(), String> {
    let result = host.complete_view(&id, error).await;
    // A view that reports ready without preparing is a window that has nothing to wait for: a
    // plugin with no sizes to state, or one whose content has none.
    desktop::reveal(&app, &id);
    result
}

/// What a plugin's view states during its preparation, before the host shows the preview
/// window. The window is built but not yet on screen, so what arrives here is in place the
/// first time the user sees it — and nothing here is a fact about the window afterwards: a
/// declared size is never written down as the user's own.
#[tauri::command]
async fn prepare_view(
    app: tauri::AppHandle,
    id: String,
    window: Option<Value>,
) -> Result<(), String> {
    let declared = window.as_ref().and_then(|window| {
        Some((
            window.get("width")?.as_f64()?,
            window.get("height")?.as_f64()?,
        ))
    });
    desktop::prepared(&app, &id, declared);
    Ok(())
}

#[tauri::command]
async fn plugin_call(
    host: Host<'_>,
    id: String,
    method: String,
    value: Value,
) -> Result<Value, String> {
    host.call(&id, &method, value).await
}

#[tauri::command]
async fn read_file(host: Host<'_>, id: String, offset: u64, length: u32) -> Result<String, String> {
    host.authorize(&id, Permission::ReadFile).await?;
    if length > 1024 * 1024 {
        return Err("Read at most 1 MiB per request".into());
    }
    let path = host.session_file(&id).await?;
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|e| e.to_string())?;
    file.seek(std::io::SeekFrom::Start(offset))
        .await
        .map_err(|e| e.to_string())?;
    let mut data = Vec::with_capacity(length as usize);
    file.take(length as u64)
        .read_to_end(&mut data)
        .await
        .map_err(|e| e.to_string())?;
    Ok(base64::engine::general_purpose::STANDARD.encode(data))
}

#[tauri::command]
async fn reorder_plugins(host: Host<'_>, ids: Vec<String>) -> Result<(), String> {
    host.reorder_plugins(ids).await
}

#[tauri::command]
async fn set_activation(host: Host<'_>, id: String, activation: Activation) -> Result<(), String> {
    host.set_activation(&id, activation).await
}

#[tauri::command]
async fn set_enabled(host: Host<'_>, id: String, enabled: bool) -> Result<(), String> {
    host.enabled(&id, enabled).await
}

#[tauri::command]
async fn plugin_settings(host: Host<'_>, id: String) -> Result<Value, String> {
    host.settings_for_session(&id).await
}

#[tauri::command]
async fn set_plugin_setting(
    host: Host<'_>,
    id: String,
    key: String,
    value: Value,
) -> Result<(), String> {
    host.set_setting(&id, &key, value).await
}

#[tauri::command]
async fn uninstall_plugin(
    host: Host<'_>,
    market: State<'_, Market>,
    id: String,
) -> Result<(), String> {
    host.uninstall(&id).await?;
    // The revisions just retired are no longer reachable, so their cached packages go too.
    market.prune_cache(host.inner()).await.map(|_| ())
}

/// One dialog per shape the window asks for: a folder for a plugin setting, a plugin
/// package, or any file to open. The package filter only says what belongs here — the
/// preparer still refuses anything that is not an archive.
#[tauri::command]
async fn pick_path(window: tauri::Window, kind: String) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = rfd::FileDialog::new().set_parent(&window);
        let result = match kind.as_str() {
            "folder" => dialog.set_title(text().dialog_pick_folder).pick_folder(),
            "package" => dialog
                .set_title(text().dialog_pick_package)
                .add_filter("Plugin package", &["zip"])
                .pick_file(),
            _ => dialog.set_title(text().dialog_pick_file).pick_file(),
        };
        result.map(|p| p.to_string_lossy().into_owned())
    })
    .await
    .map_err(|e| e.to_string())
}

/// The window's interface language. The window resolves it — it is the side that can see
/// what the system asks for — and the host applies it to everything it produces itself:
/// the tray menu, native dialogs, window titles and the error text it returns.
#[tauri::command]
async fn set_locale(app: tauri::AppHandle, host: Host<'_>, locale: String) -> Result<(), String> {
    let host = host.inner().clone();
    let was = host.locale().await;
    host.set_locale(Some(locale)).await?;
    if host.locale().await != was {
        tauri::async_runtime::spawn_blocking(move || desktop::apply_locale(&app))
            .await
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
async fn prepare_plugin(
    imports: State<'_, local_packages::LocalPackages>,
    path: String,
) -> Result<local_packages::Prepared, String> {
    imports.prepare(path).await
}

#[tauri::command]
async fn install_plugin(
    host: Host<'_>,
    market: State<'_, Market>,
    imports: State<'_, local_packages::LocalPackages>,
    token: String,
) -> Result<(), String> {
    imports.install(host.inner(), &token).await?;
    // The installed revision is on disk now, so the cache only needs to keep what the
    // installer can still reach — this package and whatever it replaced.
    market.prune_cache(host.inner()).await.map(|_| ())
}

async fn save_workshop_package(
    window: tauri::Window,
    id: String,
    bytes: Vec<u8>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let target = rfd::FileDialog::new()
            .set_parent(&window)
            .set_title("Export plugin / 导出插件")
            .set_file_name(format!("{id}.zip"))
            .add_filter("Plugin package", &["zip"])
            .save_file();
        let Some(target) = target else {
            return Ok(None);
        };
        // Same-directory staging avoids leaving a partial archive after interruption.
        let mut staged =
            tempfile::NamedTempFile::new_in(target.parent().ok_or("Invalid export destination")?)
                .map_err(|e| e.to_string())?;
        use std::io::Write;
        staged.write_all(&bytes).map_err(|e| e.to_string())?;
        staged.as_file().sync_all().map_err(|e| e.to_string())?;
        staged.persist(&target).map_err(|e| e.to_string())?;
        Ok(Some(target.to_string_lossy().into_owned()))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn mime(path: &std::path::Path) -> &'static str {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .unwrap_or_default();
    match extension.as_str() {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "wasm" => "application/wasm",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" | "apng" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "ico" => "image/x-icon",
        "mp3" => "audio/mpeg",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "wav" => "audio/wav",
        "ogg" | "oga" => "audio/ogg",
        "flac" => "audio/flac",
        "mp4" | "m4v" => "video/mp4",
        "mov" => "video/quicktime",
        "webm" => "video/webm",
        "ogv" => "video/ogg",
        "pdf" => "application/pdf",
        "ttf" => "font/ttf",
        "otf" => "font/otf",
        "woff" => "font/woff",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

const STREAM_CHUNK: u64 = 4 * 1024 * 1024;

struct ProtocolAsset {
    status: u16,
    kind: String,
    body: Vec<u8>,
    content_range: Option<String>,
    accept_ranges: bool,
}

fn requested_range(header: Option<&str>, size: u64) -> Result<(u64, u64), String> {
    if size == 0 {
        return Err("Cannot stream an empty file".into());
    }
    let value = header.unwrap_or("bytes=0-");
    let range = value
        .strip_prefix("bytes=")
        .filter(|value| !value.contains(','))
        .ok_or("Invalid byte range")?;
    let (start, requested_end) = range.split_once('-').ok_or("Invalid byte range")?;
    let (start, end) = if start.is_empty() {
        let suffix = requested_end
            .parse::<u64>()
            .ok()
            .filter(|value| *value > 0)
            .ok_or("Invalid byte range")?;
        (size.saturating_sub(suffix), size - 1)
    } else {
        let start = start.parse::<u64>().map_err(|_| "Invalid byte range")?;
        if start >= size {
            return Err("Byte range starts beyond the file".into());
        }
        let end = if requested_end.is_empty() {
            size - 1
        } else {
            requested_end
                .parse::<u64>()
                .map_err(|_| "Invalid byte range")?
                .min(size - 1)
        };
        if end < start {
            return Err("Invalid byte range".into());
        }
        (start, end)
    };
    Ok((start, end.min(start.saturating_add(STREAM_CHUNK - 1))))
}

async fn stream_asset(path: &Path, range: Option<&str>) -> Result<ProtocolAsset, String> {
    let size = tokio::fs::metadata(path)
        .await
        .map_err(|error| error.to_string())?
        .len();
    let (start, end) = requested_range(range, size)?;
    let length = end - start + 1;
    let mut file = tokio::fs::File::open(path)
        .await
        .map_err(|error| error.to_string())?;
    file.seek(std::io::SeekFrom::Start(start))
        .await
        .map_err(|error| error.to_string())?;
    let mut body = vec![0; length as usize];
    file.read_exact(&mut body)
        .await
        .map_err(|error| error.to_string())?;
    Ok(ProtocolAsset {
        status: 206,
        kind: mime(path).to_owned(),
        body,
        content_range: Some(format!("bytes {start}-{end}/{size}")),
        accept_ranges: true,
    })
}

fn main() {
    let app = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("plugin", |context, request, responder| {
            let host = context.app_handle().state::<Arc<Runtime>>().inner().clone();
            let workshop = context.app_handle().state::<Arc<workshop::Workshop>>().inner().clone();
            tauri::async_runtime::spawn(async move {
                let decoded = percent_encoding::percent_decode_str(request.uri().path()).decode_utf8_lossy();
                let path = decoded.trim_start_matches('/');
                let (session, asset) = path.split_once('/').unwrap_or((path, ""));
                let result: Result<ProtocolAsset, String> = async {
                    if let Some(reference) = asset.strip_prefix("@resource/") {
                        // The route itself has already been URL-decoded once. A local document
                        // reference may still contain its own `%20`; a remote signed URL must
                        // retain its exact encoding.
                        let reference = if reqwest::Url::parse(reference)
                            .ok()
                            .is_some_and(|url| matches!(url.scheme(), "http" | "https"))
                        {
                            reference.into()
                        } else {
                            percent_encoding::percent_decode_str(reference).decode_utf8_lossy().into_owned()
                        };
                        let loaded = resource::load(&host, session, &reference).await?;
                        return Ok(ProtocolAsset { status: 200, kind: loaded.kind, body: loaded.bytes,
                            content_range: None, accept_ranges: false });
                    }
                    let path = if let Some(id) = session.strip_prefix("@tool-") {
                        let package = host.tool_package(id).await?;
                        ember_runtime::manifest::contained(&package.directory, asset)?
                    } else if let Some(id) = session.strip_prefix("@workshop-") {
                        workshop.asset(id, asset).await?
                    } else if asset == "@file" {
                        host.authorize(session, Permission::ReadFile).await?;
                        host.session_file(session).await?
                    } else if asset == "@stream" {
                        host.authorize(session, Permission::ReadFile).await?;
                        let path = host.session_file(session).await?;
                        let range = request.headers().get("Range").and_then(|value| value.to_str().ok());
                        return stream_asset(&path, range).await;
                    } else {
                        host.asset(session, asset).await?
                    };
                    let size = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?.len();
                    let limit_mib = if asset == "@file" { 128 } else { 32 };
                    if size > limit_mib * 1024 * 1024 { return Err(format!("File exceeds {limit_mib} MiB")); }
                    let body = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
                    Ok(ProtocolAsset { status: 200, kind: mime(&path).to_owned(), body,
                        content_range: None, accept_ranges: false })
                }.await;
                let asset = match result {
                    Ok(asset) => asset,
                    Err(error) => ProtocolAsset { status: 404,
                        kind: "text/plain; charset=utf-8".to_owned(), body: error.into_bytes(),
                        content_range: None, accept_ranges: false },
                };
                let mut response = tauri::http::Response::builder().status(asset.status)
                    .header("Content-Type", asset.kind)
                    .header("Content-Length", asset.body.len().to_string())
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Access-Control-Expose-Headers", "Accept-Ranges, Content-Range")
                    .header("Cache-Control", "no-store")
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Content-Security-Policy", "default-src 'none'; script-src http://plugin.localhost plugin: 'wasm-unsafe-eval'; style-src http://plugin.localhost plugin: 'unsafe-inline'; img-src http://plugin.localhost plugin: blob: data:; media-src http://plugin.localhost plugin: blob:; font-src http://plugin.localhost plugin: data:; connect-src http://plugin.localhost plugin:; frame-src http://plugin.localhost plugin:; worker-src blob:; object-src 'none'; base-uri 'none'");
                if asset.accept_ranges { response = response.header("Accept-Ranges", "bytes"); }
                if let Some(range) = asset.content_range { response = response.header("Content-Range", range); }
                responder.respond(response.body(asset.body).unwrap());
            });
        })
        .setup(|app| {
            let workspace = PathBuf::from(env!("CARGO_MANIFEST_DIR")).parent().unwrap().to_path_buf();
            let root = if cfg!(debug_assertions) { workspace.join(".plugins") }
                else { app.path().app_data_dir()?.join("plugins") };
            let runtime = Runtime::new(root).map_err(std::io::Error::other)?;
            tauri::async_runtime::block_on(runtime.scan()).map_err(std::io::Error::other)?;
            app.manage(runtime.clone());
            app.manage(local_packages::LocalPackages::default());
            let workshop = workshop::Workshop::new(
                app.path().app_data_dir()?.join("workshop"),
                Arc::new(AppWindows { app: app.handle().clone() }),
            )
            .map_err(std::io::Error::other)?;
            app.manage(workshop);
            // The host is a shell: it ships no plugins, so a source is where both the
            // plugin list and the packages behind it come from.
            let sources = if cfg!(debug_assertions) {
                match std::env::var("EMBER_MARKET_SOURCES") {
                    Ok(config) => read_sources(Path::new(&config)),
                    // Development serves the last plugin build as a local mirror, and
                    // ignores the shipped remote source: a local build is newer than
                    // anything published, so preferring the published one would make the
                    // dev loop install stale packages.
                    // The name is left out on purpose: this is the one source the host
                    // wrote itself, so the market labels it in the interface language
                    // rather than in whatever language was in force at startup.
                    Err(_) => Ok(vec![Source {
                        name: None,
                        catalog: workspace.join(".marketplace/catalog.json").to_string_lossy().into_owned(),
                        base: workspace.join(".marketplace").to_string_lossy().into_owned(),
                    }]),
                }
            } else {
                read_sources(&app.path().resource_dir()?.join("plugin-sources.json"))
            };
            let market = Market::new(
                sources,
                // Downloaded packages are cached by content hash, so reinstalling or
                // retrying an install does not download them twice.
                if cfg!(debug_assertions) { workspace.join(".plugin-cache") }
                    else { app.path().app_data_dir()?.join("plugin-cache") },
            ).map_err(std::io::Error::other)?;
            #[cfg(debug_assertions)]
            let market = market.with_local_source(
                &workspace.join(".marketplace/catalog.json").to_string_lossy(),
            );
            let trusted_catalogs = if cfg!(debug_assertions) {
                vec![workspace.join(".marketplace/catalog.json").to_string_lossy().into_owned()]
            } else {
                serde_json::from_str::<Value>(include_str!("../plugin-sources.json")).ok()
                    .and_then(|v| v["sources"].as_array().cloned()).unwrap_or_default().iter()
                    .filter_map(|s| s["catalog"].as_str().map(str::to_owned)).collect()
            };
            let market = market.with_official_sources(trusted_catalogs);
            app.manage(market.clone());
            let migration_market = market.clone();
            let migration_runtime = runtime.clone();
            tauri::async_runtime::spawn(async move { migration_market.recover_legacy_origins(&migration_runtime).await; });
            desktop::setup(app.handle())?;
            // A fresh install can preview nothing at all, so the first run asks which
            // plugins to install and then installs them the normal way. It is recorded
            // as answered, so it is shown exactly once.
            if cfg!(debug_assertions) {
                // Development opens a window on request: windows are created on demand, so
                // tooling that needs one would otherwise have to clear the first-run answer
                // just to get a window it can talk to.
                match std::env::var("EMBER_DEBUG_WINDOW") {
                    Ok(page) => {
                        let page = Some(page);
                        if let Err(error) = desktop::show_settings(app.handle().clone(), page) {
                            eprintln!("Debug window: {error}");
                        }
                    }
                    Err(_) if !tauri::async_runtime::block_on(runtime.snapshot()).onboarded => {
                        if let Err(error) = desktop::show_settings(app.handle().clone(), Some("welcome".into())) {
                            eprintln!("Welcome window: {error}");
                        }
                    }
                    Err(_) => {}
                }
            } else if !tauri::async_runtime::block_on(runtime.snapshot()).onboarded {
                if let Err(error) = desktop::show_settings(app.handle().clone(), Some("welcome".into())) {
                    eprintln!("Welcome window: {error}");
                }
            }
            #[cfg(windows)]
            match explorer::start(app.handle().clone()) {
                Ok(explorer) => { app.manage(explorer); }
                Err(error) => return Err(std::io::Error::other(format!("Explorer integration: {error}")).into()),
            }
            if let Some(path) = std::env::args_os().nth(1) {
                let handle = app.handle().clone();
                tauri::async_runtime::spawn(async move { let _ = desktop::open(&handle, PathBuf::from(path)).await; });
            }
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let mut interval = tokio::time::interval(std::time::Duration::from_secs(2));
                loop {
                    interval.tick().await;
                    desktop::reap(&handle, runtime.has_pending().await);
                    runtime.reap().await;
                    // Detect immutable plugin builds without restarting the host or in-flight work.
                    let _ = runtime.scan().await;
                    if cfg!(debug_assertions) {
                        if let Err(error) = market.sync_development(&runtime).await { eprintln!("Plugin development sync: {error}"); }
                    }
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![updates::check_update, updates::open_update, open_workshop, icon_data, tool_call, view_state, market_list, market_refresh, market_prepare, market_install, snapshot, refresh_plugins, open_file, desktop::select_preview, desktop::return_view, desktop::desktop_snapshot, desktop::show_settings, desktop::open_in_default_app, desktop::window_basis, prepare_view, session_data, source_data, source_call, set_pending, plugin_mutate, authorize_clipboard, open_link, file_changed, complete_view, complete_onboarding, plugin_call, read_file, set_enabled, set_activation, reorder_plugins, uninstall_plugin, plugin_settings, set_plugin_setting, pick_path, prepare_plugin, install_plugin, set_locale])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                desktop::hide(window.app_handle(), window.label());
            }
            // Where the user puts a window is remembered from the events that move it, not
            // from a shutdown path: the host closes by hiding windows and may be killed
            // outright, so a window that is never "closed" still has a placement to restore.
            match event {
                tauri::WindowEvent::Resized(_) => desktop::remember(window, true),
                tauri::WindowEvent::Moved(_) => desktop::remember(window, false),
                _ => {}
            }
        })
        .build(tauri::generate_context!())
        .expect("Build Ember Peek");
    app.run(|handle, event| {
        if let tauri::RunEvent::ExitRequested {
            code: None, api, ..
        } = &event
        {
            api.prevent_exit();
        }
        if matches!(event, tauri::RunEvent::Exit) {
            #[cfg(windows)]
            if let Some(explorer) = handle.try_state::<explorer::Explorer>() {
                explorer.stop();
            }
            tauri::async_runtime::block_on(handle.state::<Arc<Runtime>>().shutdown());
        }
    });
}

#[cfg(test)]
mod stream_tests {
    use super::*;

    #[test]
    fn open_ended_ranges_are_bounded() {
        assert_eq!(
            requested_range(Some("bytes=7-"), 10_000_000).unwrap(),
            (7, 4_194_310)
        );
    }

    #[test]
    fn suffix_ranges_respect_the_file_end() {
        assert_eq!(
            requested_range(Some("bytes=-128"), 1_000).unwrap(),
            (872, 999)
        );
    }
}
