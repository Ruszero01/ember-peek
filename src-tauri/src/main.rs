#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;
#[cfg(windows)]
mod explorer;
mod local_packages;

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
async fn complete_view(host: Host<'_>, id: String, error: Option<String>) -> Result<(), String> {
    host.complete_view(&id, error).await
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

#[tauri::command]
async fn pick_path(window: tauri::Window, folder: bool) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let dialog = rfd::FileDialog::new().set_parent(&window);
        let result = if folder {
            dialog
                .set_title(text().dialog_pick_plugin_folder)
                .pick_folder()
        } else {
            dialog.set_title(text().dialog_pick_file).pick_file()
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

fn mime(path: &std::path::Path) -> &'static str {
    match path.extension().and_then(|p| p.to_str()).unwrap_or("") {
        "html" => "text/html; charset=utf-8",
        "js" | "mjs" => "text/javascript; charset=utf-8",
        "css" => "text/css; charset=utf-8",
        "wasm" => "application/wasm",
        "json" => "application/json",
        "svg" => "image/svg+xml",
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "avif" => "image/avif",
        "woff2" => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn main() {
    let app = tauri::Builder::default()
        .register_asynchronous_uri_scheme_protocol("plugin", |context, request, responder| {
            let host = context.app_handle().state::<Arc<Runtime>>().inner().clone();
            tauri::async_runtime::spawn(async move {
                let decoded = percent_encoding::percent_decode_str(request.uri().path()).decode_utf8_lossy();
                let path = decoded.trim_start_matches('/');
                let (session, asset) = path.split_once('/').unwrap_or((path, ""));
                let result = async {
                    let path = if asset == "@file" {
                        host.authorize(session, Permission::ReadFile).await?;
                        host.session_file(session).await?
                    } else {
                        host.asset(session, asset).await?
                    };
                    let size = tokio::fs::metadata(&path).await.map_err(|e| e.to_string())?.len();
                    if size > 32 * 1024 * 1024 { return Err("Plugin file exceeds 32 MiB".to_string()); }
                    let body = tokio::fs::read(&path).await.map_err(|e| e.to_string())?;
                    Ok((mime(&path), body))
                }.await;
                let (status, content_type, body) = match result {
                    Ok((kind, body)) => (200, kind, body),
                    Err(error) => (404, "text/plain; charset=utf-8", error.into_bytes()),
                };
                let response = tauri::http::Response::builder().status(status)
                    .header("Content-Type", content_type)
                    .header("Access-Control-Allow-Origin", "*")
                    .header("Cache-Control", "no-store")
                    .header("X-Content-Type-Options", "nosniff")
                    .header("Content-Security-Policy", "default-src 'none'; script-src http://plugin.localhost plugin: 'wasm-unsafe-eval'; style-src http://plugin.localhost plugin: 'unsafe-inline'; img-src http://plugin.localhost plugin: blob: data:; media-src blob:; font-src http://plugin.localhost plugin: data:; connect-src http://plugin.localhost plugin:; worker-src blob:; object-src 'none'; base-uri 'none'")
                    .body(body).unwrap();
                responder.respond(response);
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
        .invoke_handler(tauri::generate_handler![view_state, market_list, market_refresh, market_prepare, market_install, snapshot, refresh_plugins, open_file, desktop::select_preview, desktop::return_view, desktop::desktop_snapshot, desktop::show_settings, session_data, source_data, source_call, set_pending, plugin_mutate, authorize_clipboard, file_changed, complete_view, complete_onboarding, plugin_call, read_file, set_enabled, set_activation, reorder_plugins, uninstall_plugin, plugin_settings, set_plugin_setting, pick_path, prepare_plugin, install_plugin, set_locale])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                desktop::hide(window.app_handle(), window.label());
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
