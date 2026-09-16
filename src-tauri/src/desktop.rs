use ember_runtime::{Runtime, Snapshot};
use serde::Serialize;
use std::{
    collections::HashMap,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

const IDLE: Duration = Duration::from_secs(120);
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub revision: u64,
    pub error: Option<String>,
    pub settings_page: String,
    pub settings_revision: u64,
}
#[derive(Default)]
struct Inner {
    status: Status,
    generation: u64,
    hidden: HashMap<String, Instant>,
}
#[derive(Default)]
pub struct Desktop {
    inner: Mutex<Inner>,
    selection: tokio::sync::Mutex<()>,
    creation: Mutex<()>,
}

impl Desktop {
    fn begin(&self) -> u64 {
        let mut inner = self.inner.lock().unwrap();
        inner.generation += 1;
        inner.generation
    }
    // Publish only completed transitions. A snapshot must not consume an in-flight
    // request's revision before its error/selection has been committed.
    fn commit(&self, revision: u64, error: Option<String>) -> bool {
        let mut inner = self.inner.lock().unwrap();
        if inner.generation != revision {
            return false;
        }
        inner.status.revision = revision;
        inner.status.error = error;
        true
    }
    fn current(&self, revision: u64) -> bool {
        self.inner.lock().unwrap().generation == revision
    }
}

fn requested(app: &AppHandle, label: &str, revision: u64) -> bool {
    let desktop = app.state::<Desktop>();
    let inner = desktop.inner.lock().unwrap();
    if label == "preview" {
        inner.generation == revision
    } else {
        inner.status.settings_revision == revision
    }
}

// WebviewWindowBuilder must run outside synchronous event callbacks on Windows.
// Only the final visibility transition is dispatched to the main event loop.
fn queue_show(app: &AppHandle, label: &'static str, revision: u64) {
    {
        let desktop = app.state::<Desktop>();
        let mut inner = desktop.inner.lock().unwrap();
        let current = if label == "preview" {
            inner.generation
        } else {
            inner.status.settings_revision
        };
        if current != revision {
            return;
        }
        inner.hidden.remove(label);
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let desktop = handle.state::<Desktop>();
        let _creation = desktop.creation.lock().unwrap();
        if !requested(&handle, label, revision) {
            return;
        }
        if handle.get_webview_window(label).is_none() {
            let builder = WebviewWindowBuilder::new(
                &handle,
                label,
                WebviewUrl::App(format!("index.html?window={label}").into()),
            )
            .title(if label == "settings" {
                "Ember Peek · 设置"
            } else {
                "Ember Peek"
            })
            .inner_size(1060.0, 740.0)
            .min_inner_size(640.0, 440.0)
            // 创建时居中于主显示器的工作区（避开任务栏）。只在创建时定位，
            // 已存在的窗口隐藏后复用不会被重新居中，为后续记住窗口位置留出空间。
            .center()
            .decorations(false)
            .visible(false);
            let builder = if label == "settings" {
                builder.disable_drag_drop_handler()
            } else {
                builder
            };
            let result = builder.build();
            if let Err(error) = result {
                eprintln!("Create {label}: {error}");
                return;
            }
            // Even a creation invalidated while WebView2 starts must eventually be recycled.
            desktop
                .inner
                .lock()
                .unwrap()
                .hidden
                .entry(label.into())
                .or_insert_with(Instant::now);
        }
        let app = handle.clone();
        let _ = handle.run_on_main_thread(move || {
            if !requested(&app, label, revision) {
                return;
            }
            let Some(window) = app.get_webview_window(label) else {
                return;
            };
            let result = (|| -> tauri::Result<()> {
                let _ = window.emit("desktop-changed", ());
                window.unminimize()?;
                window.show()?;
                app.state::<Desktop>()
                    .inner
                    .lock()
                    .unwrap()
                    .hidden
                    .remove(label);
                window.set_focus()
            })();
            if let Err(error) = result {
                eprintln!("Show {label}: {error}");
            }
        });
    });
}
fn present(app: &AppHandle, revision: u64) {
    queue_show(app, "preview", revision);
}

pub async fn open(app: &AppHandle, path: PathBuf) -> Result<(), String> {
    let desktop = app.state::<Desktop>();
    let revision = desktop.begin();
    let _selection = desktop.selection.lock().await;
    let runtime = app.state::<Arc<Runtime>>();
    // Runtime owns loading tasks: moving to another file never cancels the plugin.
    let result = runtime.inner().open(path).await;
    if desktop.current(revision) {
        match &result {
            Ok(session) => {
                runtime.activate(Some(session.id.clone())).await?;
            }
            Err(_) => {
                runtime.activate(None).await?;
            }
        }
        if desktop.commit(revision, result.err()) {
            present(app, revision);
        }
    }
    Ok(())
}
pub async fn refresh_file(app: &AppHandle, id: &str, return_to_source: bool) -> Result<(), String> {
    let desktop = app.state::<Desktop>();
    let revision = desktop.inner.lock().unwrap().generation;
    let _selection = desktop.selection.lock().await;
    let runtime = app.state::<Arc<Runtime>>();
    let snapshot = runtime.snapshot().await;
    let file_id = snapshot
        .sessions
        .iter()
        .find(|s| s.id == id)
        .ok_or("Session expired")?
        .file_id
        .clone();
    runtime.invalidate(&file_id).await;
    if snapshot
        .sessions
        .iter()
        .any(|s| s.file_id == file_id && s.dirty)
    {
        return Ok(());
    }
    if !desktop.current(revision)
        || !snapshot
            .sessions
            .iter()
            .any(|s| Some(&s.id) == snapshot.active.as_ref() && s.file_id == file_id)
    {
        return Ok(());
    }
    let session = runtime
        .inner()
        .open(runtime.session_file(id).await?)
        .await?;
    let previous_plugin = snapshot
        .sessions
        .iter()
        .find(|s| Some(&s.id) == snapshot.active.as_ref())
        .map(|s| &s.plugin_id);
    let next = runtime.snapshot().await;
    let selected = next
        .sessions
        .iter()
        .find(|s| s.file_id == session.file_id && Some(&s.plugin_id) == previous_plugin)
        .map(|s| s.id.clone())
        .unwrap_or(session.id);
    let target = if return_to_source {
        runtime.return_target(&selected).await?
    } else {
        selected
    };
    if desktop.current(revision) {
        runtime.activate(Some(target)).await?;
        if desktop.commit(revision, None) {
            present(app, revision);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn return_view(app: AppHandle, id: String) -> Result<(), String> {
    let desktop = app.state::<Desktop>();
    let revision = desktop.inner.lock().unwrap().generation;
    let _selection = desktop.selection.lock().await;
    let runtime = app.state::<Arc<Runtime>>();
    let snapshot = runtime.snapshot().await;
    if snapshot.active.as_ref() != Some(&id) || !desktop.current(revision) {
        return Ok(());
    }
    if snapshot.sessions.iter().any(|s| s.id == id && s.dirty) {
        return Err("请先保存或撤销编辑".into());
    }
    let target = runtime.return_target(&id).await?;
    if desktop.current(revision) {
        runtime.activate(Some(target)).await?;
        if desktop.commit(revision, None) {
            present(&app, revision);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn select_preview(app: AppHandle, id: Option<String>) -> Result<(), String> {
    let desktop = app.state::<Desktop>();
    let revision = desktop.begin();
    let _selection = desktop.selection.lock().await;
    if desktop.current(revision) {
        app.state::<Arc<Runtime>>().activate(id).await?;
        if desktop.commit(revision, None) {
            present(&app, revision);
        }
    }
    Ok(())
}
#[tauri::command]
pub async fn desktop_snapshot(app: AppHandle) -> DesktopSnapshot {
    let desktop = app.state::<Desktop>();
    let _selection = desktop.selection.lock().await;
    let snapshot = app.state::<Arc<Runtime>>().snapshot().await;
    let status = desktop.inner.lock().unwrap().status.clone();
    DesktopSnapshot { snapshot, status }
}
#[derive(Serialize)]
pub struct DesktopSnapshot {
    snapshot: Snapshot,
    status: Status,
}
#[tauri::command]
pub fn show_settings(app: AppHandle, page: Option<String>) -> Result<(), String> {
    let page = page
        .filter(|v| matches!(v.as_str(), "general" | "plugins" | "about" | "welcome"))
        .unwrap_or_else(|| "general".into());
    let revision = {
        let desktop = app.state::<Desktop>();
        let mut inner = desktop.inner.lock().unwrap();
        inner.status.settings_page = page;
        inner.status.settings_revision += 1;
        inner.status.settings_revision
    };
    queue_show(&app, "settings", revision);
    Ok(())
}
pub fn hide(app: &AppHandle, label: &str) {
    if let Some(window) = app.get_webview_window(label) {
        if window.hide().is_err() {
            return;
        }
        let desktop = app.state::<Desktop>();
        desktop
            .inner
            .lock()
            .unwrap()
            .hidden
            .insert(label.to_owned(), Instant::now());
        if label == "settings" {
            desktop.inner.lock().unwrap().status.settings_revision += 1;
        }
        if label == "preview" {
            let revision = desktop.begin();
            let handle = app.clone();
            tauri::async_runtime::spawn(async move {
                let desktop = handle.state::<Desktop>();
                let _selection = desktop.selection.lock().await;
                if desktop.current(revision) {
                    let _ = handle.state::<Arc<Runtime>>().activate(None).await;
                    desktop.commit(revision, None);
                }
            });
        }
    }
}
pub fn reap(app: &AppHandle, dirty: bool) {
    let handle = app.clone();
    let _ = app.run_on_main_thread(move || {
        let expired: Vec<_> = handle
            .state::<Desktop>()
            .inner
            .lock()
            .unwrap()
            .hidden
            .iter()
            .filter(|(_, since)| since.elapsed() >= IDLE)
            .map(|(label, _)| label.clone())
            .collect();
        for label in expired {
            if dirty && label == "preview" {
                continue;
            }
            if let Some(window) = handle.get_webview_window(&label) {
                if window.is_visible().unwrap_or(true) {
                    continue;
                }
                // Close this controller; WebView2 releases its shared browser after the last view closes.
                if let Err(error) = window.destroy() {
                    eprintln!("Recycle {label}: {error}");
                    continue;
                }
            }
            handle
                .state::<Desktop>()
                .inner
                .lock()
                .unwrap()
                .hidden
                .remove(&label);
        }
    });
}
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    app.manage(Desktop::default());
    let settings = MenuItem::with_id(app, "settings", "设置", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "退出", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&settings, &quit])?;
    let mut tray = TrayIconBuilder::with_id("ember-peek")
        .tooltip("Ember Peek · 选中文件后按空格预览")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                let _ = show_settings(app.clone(), None);
            }
            "quit" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if app.state::<Arc<Runtime>>().has_dirty().await {
                        let discard = tauri::async_runtime::spawn_blocking(|| {
                            rfd::MessageDialog::new()
                                .set_title("有未保存的编辑")
                                .set_description("退出将丢弃所有未保存的编辑，是否继续？")
                                .set_buttons(rfd::MessageButtons::YesNo)
                                .show()
                        })
                        .await;
                        if !matches!(discard, Ok(rfd::MessageDialogResult::Yes)) {
                            return;
                        }
                    }
                    app.exit(0);
                });
            }
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if matches!(
                event,
                TrayIconEvent::DoubleClick {
                    button: MouseButton::Left,
                    ..
                }
            ) {
                let app = tray.app_handle().clone();
                tauri::async_runtime::spawn(async move {
                    let _ = select_preview(app, None).await;
                });
            }
        });
    if let Some(icon) = app.default_window_icon() {
        tray = tray.icon(icon.clone());
    }
    tray.build(app)?;
    Ok(())
}
