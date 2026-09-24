use ember_runtime::i18n::{fill, text, Refusal};
use ember_runtime::{PendingChange, Runtime, Snapshot, WindowState};
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
/// The window labels the host creates on demand.
const WINDOWS: [&str; 2] = ["preview", "settings"];
/// Keep enough width for the preview chrome even when a very tall image asks for less.
/// The host grows the declared height proportionally, subject to the monitor work area.
pub(crate) const MIN_PREVIEW_SIZE: (f64, f64) = (320.0, 240.0);
const MIN_SETTINGS_SIZE: (f64, f64) = (640.0, 440.0);
/// The size a preview window opens with when the user has never resized one.
const DEFAULT_INNER_SIZE: (f64, f64) = (1060.0, 740.0);
/// How long the host waits after the window stops moving before it writes the placement down.
/// Dragging an edge produces a resize event per pixel, and only the last one is worth keeping.
const PLACEMENT_IDLE: Duration = Duration::from_millis(600);
/// How long the host holds a preview window back for a plugin's preparation before showing it
/// anyway. A plugin that prepares is reporting something it already knows (a picture's size is
/// in its header), so this is the answer for one that hangs, not a budget to plan against.
const PREPARE_TIMEOUT: Duration = Duration::from_millis(700);
/// Title of a window as it appears in the taskbar and the window menu. The settings
/// window says what it is; the preview window is the application, so it is the brand.
fn window_title(label: &str) -> &'static str {
    if label == "settings" {
        text().window_settings_title
    } else {
        "Ember Peek"
    }
}

/// The tray menu in the interface language. Rebuilt whenever the language changes, since
/// a menu item's label is fixed once it is created.
fn tray_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let t = text();
    let settings = MenuItem::with_id(app, "settings", t.tray_settings, true, None::<&str>)?;
    // Development only: the first-run chooser otherwise only comes back by clearing the
    // app data directory by hand, which is not something to ask of whoever is testing it.
    #[cfg(debug_assertions)]
    let reset = MenuItem::with_id(app, "reset", t.tray_reset, true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", t.tray_quit, true, None::<&str>)?;
    #[cfg(debug_assertions)]
    let menu = Menu::with_items(app, &[&settings, &reset, &quit])?;
    #[cfg(not(debug_assertions))]
    let menu = Menu::with_items(app, &[&settings, &quit])?;
    Ok(menu)
}

/// Speak the language the host just switched to: the tray labels and the title of any
/// window already open. Called after the runtime has stored the new language.
pub fn apply_locale(app: &AppHandle) {
    if let Some(tray) = app.tray_by_id("ember-peek") {
        match tray_menu(app) {
            Ok(menu) => {
                if let Err(error) = tray.set_menu(Some(menu)) {
                    eprintln!("Tray menu language: {error}");
                }
            }
            Err(error) => eprintln!("Tray menu language: {error}"),
        }
    }
    for label in WINDOWS {
        if let Some(window) = app.get_webview_window(label) {
            let _ = window.set_title(window_title(label));
        }
    }
}
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub revision: u64,
    pub error: Option<String>,
    pub settings_page: String,
    pub settings_revision: u64,
}
/// Every piece of the desktop the host keeps: which file is being shown, which window is
/// waiting for its view, and where the user last left the preview window.
///
/// **Never call a window or monitor API while holding this lock.** Those calls are answered by
/// the main thread, and the main thread takes this same lock in its window event handler, so a
/// worker thread holding it and waiting for an answer stops the thread that has to give one:
/// the preview then hangs before it is ever shown, and every later command queues behind it.
#[derive(Default)]
struct Inner {
    last_path: Option<PathBuf>,
    status: Status,
    generation: u64,
    hidden: HashMap<String, Instant>,
    /// The placement the next preview window opens with — the user's own size, remembered
    /// from the last time they resized it — and whether a write of it is already on its way.
    window: Option<WindowState>,
    remembering: bool,
    /// What each session's view asked for during its preparation, in CSS pixels, and the
    /// geometry the host applied from it. A view prepares once per session, so a window shown
    /// again for the same session is shaped from it without the view having to say it twice.
    /// A user resize marks its session, so reopening that session does not apply its old claim.
    prepared: HashMap<String, Prepared>,
    /// The most recent size imposed by the host. Set before `set_size`, because its resize
    /// event can run before that call returns; it must never become the user's baseline.
    imposing: Option<(u32, u32)>,
    /// Whether the preview window has been minimized since it last reported a geometry of its
    /// own, and the geometry it reported then. A window in the icon state has no size of its
    /// own: what it reports while it is down is the size of the icon, and what it reports when it
    /// comes back is `underneath` — which can be a shape a plugin fitted to a file that is no
    /// longer open, and never a size the user just chose. The host recognizes that geometry,
    /// keeps it out of the record, and sizes the window again for what is showing now
    /// (`restore_content_size`). Live state, not part of the placement: a window does not outlive
    /// the run, and the placement is what gets written to disk.
    put_aside: bool,
    underneath: Option<(u32, u32)>,
    /// The session whose window is being held back, with the revision it was opened for. The
    /// preview window exists but has not been shown yet, because this session's view has not
    /// prepared — showing it first would make the content jump into place after the user is
    /// already looking at it.
    holding: Option<(String, u64)>,
    /// The view the preview window is showing: its session, and whether that plugin prepares
    /// before the window is shown. Set when a file is opened and when the user switches views.
    active: Option<(String, bool)>,
    /// Last session sent to the visible preview. A switch to another view can reshape the
    /// already visible window, while another update to the same view leaves user sizing alone.
    displayed: Option<String>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowBasis {
    width: f64,
    height: f64,
}

/// The user's baseline is independent of the temporary size a plugin last applied.
#[tauri::command]
pub fn window_basis(app: AppHandle) -> WindowBasis {
    let saved = app.state::<Desktop>().inner.lock().unwrap().window.clone();
    match saved {
        Some(state) => WindowBasis {
            width: state.width as f64,
            height: state.height as f64,
        },
        None => WindowBasis {
            width: DEFAULT_INNER_SIZE.0,
            height: DEFAULT_INNER_SIZE.1,
        },
    }
}

/// What a session's view declared in its preparation.
#[derive(Clone)]
struct Prepared {
    /// The size the view asked the window to have, in CSS pixels.
    window: Option<(f64, f64)>,
    user_resized: bool,
}
impl Prepared {
    /// The size this view has a claim on: what it declared, unless the user has resized the
    /// window since — their own size replaces it from then on.
    fn claimed(&self) -> Option<(f64, f64)> {
        if self.user_resized {
            return None;
        }
        self.window
    }
}
impl Inner {
    fn hold_for_show(&mut self, label: &str, on_screen: bool, revision: u64) {
        if label != "preview" {
            return;
        }
        self.holding = match &self.active {
            Some((session, true)) if !on_screen && !self.prepared.contains_key(session) => {
                Some((session.clone(), revision))
            }
            _ => None,
        };
    }

    fn size_for_show(&self, label: &str, on_screen: bool) -> Option<(f64, f64)> {
        if label != "preview" {
            return None;
        }
        self.active
            .as_ref()
            .filter(|(id, _)| !on_screen || self.displayed.as_ref() != Some(id))
            .and_then(|(id, _)| self.prepared.get(id))
            .and_then(|entry| entry.claimed())
    }

    /// The size the view showing the active file claims for the window, whatever the window is
    /// doing at the moment. A claim outlives the window being hidden or put aside: the host
    /// applies it again whenever it takes the window's size back into its own hands
    /// (`restore_content_size`), so a picture that was framed is framed again.
    fn claimed_for_active(&self) -> Option<(f64, f64)> {
        let (id, _) = self.active.as_ref()?;
        self.prepared.get(id)?.claimed()
    }

    fn restore_on_visible_switch(&self) -> bool {
        match &self.active {
            Some((id, prepares)) => !prepares && self.displayed.as_ref() != Some(id),
            None => self.displayed.is_some(),
        }
    }

    fn record_preparation(&mut self, session: &str, declared: Option<(f64, f64)>) -> bool {
        if !self
            .active
            .as_ref()
            .is_some_and(|(active, prepares)| active == session && *prepares)
        {
            return false;
        }
        if self.prepared.contains_key(session) {
            return false;
        }
        if self.prepared.len() >= 64 {
            self.prepared.clear();
        }
        self.prepared.insert(
            session.to_string(),
            Prepared {
                window: declared,
                user_resized: false,
            },
        );
        self.holding
            .as_ref()
            .is_some_and(|(held, _)| held == session)
    }

    fn note_user_resize(&mut self) {
        let current = self.active.as_ref().map(|(id, _)| id.clone());
        // Cached sizes for other files were calculated from the previous user baseline. Their
        // views will calculate again when selected, using the newly remembered dimensions.
        self.prepared.retain(|id, _| current.as_ref() == Some(id));
        if let Some(current) = current {
            if let Some(prepared) = self.prepared.get_mut(&current) {
                prepared.user_resized = true;
            }
        }
    }
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

/// Extra WebView2 arguments for this session, for development tooling.
///
/// Every window exists only because this code builds it, so these cannot come from the Tauri
/// config the way a declarative window's `additionalBrowserArgs` can. WebView2's own
/// `WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS` variable does not work either: wry always passes an
/// explicit argument string, and the loader reads that variable only when the host passes none,
/// so a debugging port asked for that way never opens. A development session names its
/// arguments here instead, and a release build can never enable them. Passing arguments
/// replaces wry's own defaults, so the caller's value has to include them.
fn browser_args() -> Option<String> {
    if !cfg!(debug_assertions) {
        return None;
    }
    std::env::var("EMBER_WEBVIEW_ARGS")
        .ok()
        .filter(|args| !args.trim().is_empty())
}

fn restore_user_size(app: &AppHandle, window: &tauri::WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        return;
    }
    let basis = window_basis(app.clone());
    app.state::<Desktop>().inner.lock().unwrap().imposing =
        Some((basis.width.round() as u32, basis.height.round() as u32));
    let _ = window.set_size(tauri::LogicalSize::new(basis.width, basis.height));
}

// WebviewWindowBuilder must run outside synchronous event callbacks on Windows.
// Only the final visibility transition is dispatched to the main event loop.
fn queue_show(app: &AppHandle, label: &'static str, revision: u64) {
    // Ask the window what it is before taking the lock: window calls are answered by the main
    // thread, which takes this same lock in its own window event handler. Holding it across a
    // window call deadlocks the two against each other.
    let on_screen = app
        .get_webview_window(label)
        .is_some_and(|window| window.is_visible().unwrap_or(false));
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
        // A plugin that prepares before the window is shown decides how big that window opens,
        // so the window is not shown until this session's view has said what it needs — or
        // reported that it needs nothing. The host has already built the window at the size the
        // user's own last one had, which is what the view measures against.
        inner.hold_for_show(label, on_screen, revision);
    }
    let handle = app.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let desktop = handle.state::<Desktop>();
        let _creation = desktop.creation.lock().unwrap();
        if !requested(&handle, label, revision) {
            return;
        }
        let existing = handle.get_webview_window(label);
        if existing.is_none() {
            let saved = desktop.inner.lock().unwrap().window.clone();
            let builder = WebviewWindowBuilder::new(
                &handle,
                label,
                WebviewUrl::App(format!("index.html?window={label}").into()),
            )
            .title(window_title(label))
            .min_inner_size(
                if label == "preview" {
                    MIN_PREVIEW_SIZE.0
                } else {
                    MIN_SETTINGS_SIZE.0
                },
                if label == "preview" {
                    MIN_PREVIEW_SIZE.1
                } else {
                    MIN_SETTINGS_SIZE.1
                },
            )
            .decorations(false)
            .visible(false);
            // The preview window is the user's own: it opens where they last left it, at the
            // size they gave it. Every other window is opened from a menu or a tool and is
            // centered instead — nobody resizes the settings window and expects it back.
            let builder = match saved {
                Some(state) if label == "preview" => builder
                    .position(state.x as f64, state.y as f64)
                    .inner_size(state.width as f64, state.height as f64)
                    .maximized(state.maximized),
                _ => builder
                    .inner_size(DEFAULT_INNER_SIZE.0, DEFAULT_INNER_SIZE.1)
                    .center(),
            };
            let builder = match browser_args() {
                Some(args) => builder.additional_browser_args(&args),
                None => builder,
            };
            // Every window keeps the native file-drop handler, including the settings
            // window: a dropped file has to arrive as a path, and a web page never sees
            // one. The workshop's tool page lives here and takes samples by path only.
            let result = builder.build();
            if let Err(error) = result {
                eprintln!("Create {label}: {error}");
                return;
            }
            if label == "preview" {
                if let Some(window) = handle.get_webview_window(label) {
                    return_to_screen(&window);
                }
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
        if label == "preview" {
            if let Some(window) = handle.get_webview_window(label) {
                // A hidden controller may still have the last plugin's temporary size. Start
                // every opening from the user's baseline before the next view measures it.
                let restore = (!on_screen && existing.is_some())
                    || (on_screen && desktop.inner.lock().unwrap().restore_on_visible_switch());
                if restore {
                    restore_user_size(&handle, &window);
                }
                if !on_screen {
                    let _ = window.emit("desktop-changed", ());
                }
            }
        }
        // A session whose view prepared before is shaped from what it said then: a view prepares
        // once per session, and every window that session opens is built to the size it asked
        // for. The view itself is long gone in that case, so nothing would ask it again.
        let prepared = desktop
            .inner
            .lock()
            .unwrap()
            .size_for_show(label, on_screen);
        if let Some(declared) = prepared {
            let unplaced = !on_screen && desktop.inner.lock().unwrap().window.is_none();
            if let Some(window) = handle.get_webview_window(label) {
                apply_prepared(&handle, &window, declared, unplaced);
            }
        }
        let holding = if label == "preview" {
            desktop.inner.lock().unwrap().holding.clone()
        } else {
            None
        };
        if let Some((session, _)) = holding {
            if desktop
                .inner
                .lock()
                .unwrap()
                .prepared
                .contains_key(&session)
            {
                reveal(&handle, &session);
                return;
            }
            // Held back: the view has a preparation to make (or a readiness to report), and the
            // timer is what a plugin that does neither gets.
            let timer = handle.clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(PREPARE_TIMEOUT).await;
                reveal(&timer, &session);
            });
            return;
        }
        show_window(&handle, label, revision);
    });
}

/// The size a plugin asked for during its preparation, applied to a window that is not on
/// screen yet (or is about to be shown again). The size is what changes; the position is the
/// user's and stays where it is, and the room the window has is measured from that position.
/// A window the user has never placed is centered on its monitor instead, so the first picture
/// does not open against the corner of a monitor the user has not chosen.
///
/// Takes no lock across a window call: every call in here is answered by the main thread, which
/// takes that lock from its own window event handler.
fn apply_prepared(
    app: &AppHandle,
    window: &tauri::WebviewWindow,
    declared: (f64, f64),
    unplaced: bool,
) -> Option<()> {
    apply_size(app, window, declared)?;
    if unplaced {
        // Centering is the host placing a window the user has never placed; the plugin asked
        // for a size, not for a position.
        let _ = window.center();
    }
    Some(())
}

/// Put one size on the preview window, the way the host applies every size it computes: fitted
/// to the room the window's position leaves on its monitor, and raised to the preview minimum
/// when a short side is below it. The size is written down as the host's own before the window
/// is asked for it, because the resize event it causes can run before this call returns, and it
/// must never be read back as the user choosing that size.
fn apply_size(app: &AppHandle, window: &tauri::WebviewWindow, size: (f64, f64)) -> Option<()> {
    let position = window.outer_position().ok()?;
    let room = crate::framing::room(app, (position.x, position.y))?;
    let (width, height, _) = crate::framing::clamp(size, room, MIN_PREVIEW_SIZE);
    app.state::<Desktop>().inner.lock().unwrap().imposing =
        Some((width.round() as u32, height.round() as u32));
    window.set_size(tauri::LogicalSize::new(width, height)).ok()
}

/// Size the window again for what it is showing: the active view's own claim if it still has
/// one, and the user's remembered size otherwise. This is the host taking the window's size
/// back after a state it could not size it in: the size of a maximized window is the screen's,
/// a minimized one has no size of its own, and the geometry the OS hands back as the window
/// leaves either state is the one from underneath it — a shape a plugin may have fitted to a
/// file that is no longer open. Until this runs, that shape is what the next file opens in.
fn restore_content_size(app: &AppHandle, window: &tauri::WebviewWindow) {
    if window.is_maximized().unwrap_or(false) {
        return;
    }
    let declared = app
        .state::<Desktop>()
        .inner
        .lock()
        .unwrap()
        .claimed_for_active();
    match declared {
        // Only the size is put back; the position is the user's and does not move.
        Some(declared) => {
            let _ = apply_prepared(app, window, declared, false);
        }
        None => restore_user_size(app, window),
    }
}

/// What a view declared in its preparation, from the window it belongs to.
///
/// A preparation with no window in it is still a preparation: the view has said what it needs,
/// which is nothing, so a window the host is holding back for it opens now. When the user switches
/// files while the preview is visible, the new view's first declaration reshapes that window at
/// once, without moving it or replacing the user's baseline.
pub fn prepared(app: &AppHandle, session: &str, declared: Option<(f64, f64)>) {
    let desktop = app.state::<Desktop>();
    // A stale iframe can finish after another file has become active. Its declaration must
    // never shape the new file's window or release that file's hold.
    let eligible = {
        let inner = desktop.inner.lock().unwrap();
        inner
            .active
            .as_ref()
            .is_some_and(|(active, prepares)| active == session && *prepares)
            && !inner.prepared.contains_key(session)
    };
    if !eligible {
        return;
    }
    let declared = declared.filter(|(width, height)| crate::framing::valid(*width, *height));
    // Everything the window is asked about is asked before the lock is taken, and the size is
    // applied before it too: a window call made while holding that lock waits on the main
    // thread, which is waiting for the same lock in its window event handler.
    let window = app.get_webview_window("preview");
    let visible = window
        .as_ref()
        .is_some_and(|window| window.is_visible().unwrap_or(false));
    let unplaced = !visible && desktop.inner.lock().unwrap().window.is_none();
    match (declared, window.as_ref()) {
        (Some(declared), Some(window)) => {
            let _ = apply_prepared(app, window, declared, unplaced);
        }
        (None, Some(window)) if visible => {
            restore_user_size(app, window);
        }
        _ => {}
    };
    let held = desktop
        .inner
        .lock()
        .unwrap()
        .record_preparation(session, declared);
    if held && window.is_some() {
        // `reveal` owns the transition out of holding. Clearing it here would make both this
        // call and the timeout see nothing to reveal, leaving the preview hidden forever.
        reveal(app, session);
    }
}

/// Show the preview window a preparation was holding back, if that is still the window being
/// waited for. Called when the view prepares, when it reports ready, and by the fallback timer;
/// each of those is only a reason to stop waiting, so it is safe for them to race.
pub fn reveal(app: &AppHandle, session: &str) {
    let desktop = app.state::<Desktop>();
    let revision = {
        let mut inner = desktop.inner.lock().unwrap();
        match inner.holding.as_ref() {
            Some((held, revision)) if held == session => {
                let revision = *revision;
                inner.holding = None;
                revision
            }
            _ => return,
        }
    };
    if !requested(app, "preview", revision) {
        return;
    }
    show_window(app, "preview", revision);
}

/// Put a window on screen. Everything that can end an opening ends here, so the transition
/// itself happens once: the frontend is told, then the window is restored, shown and focused.
fn show_window(app: &AppHandle, label: &'static str, revision: u64) {
    let app = app.clone();
    let _ = app.clone().run_on_main_thread(move || {
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
            {
                let desktop = app.state::<Desktop>();
                let mut inner = desktop.inner.lock().unwrap();
                inner.hidden.remove(label);
                if label == "preview" {
                    inner.displayed = inner.active.as_ref().map(|(id, _)| id.clone());
                }
            }
            window.set_focus()
        })();
        if let Err(error) = result {
            eprintln!("Show {label}: {error}");
        }
    });
}
fn present(app: &AppHandle, revision: u64) {
    queue_show(app, "preview", revision);
}

pub async fn open(app: &AppHandle, path: PathBuf) -> Result<(), String> {
    let desktop = app.state::<Desktop>();
    let revision = desktop.begin();
    desktop.inner.lock().unwrap().last_path = Some(path.clone());
    let _selection = desktop.selection.lock().await;
    let runtime = app.state::<Arc<Runtime>>();
    // Runtime owns loading tasks: moving to another file never cancels the plugin.
    let result = runtime.inner().open(path).await;
    if desktop.current(revision) {
        // Which view the window is about to show, and whether that plugin prepares before it
        // is shown. Recorded here because the window is built from it right after.
        desktop.inner.lock().unwrap().active = result
            .as_ref()
            .ok()
            .map(|session| (session.id.clone(), session.prepare));
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

/// A window restored from a saved placement can land outside every monitor: the display it was
/// closed on may be gone, or now arranged differently. Windows does not move it back, and a
/// window nobody can see is worse than one that opens in the middle, so the host checks the
/// screen the window actually landed on.
fn return_to_screen(window: &tauri::WebviewWindow) {
    let Ok(Some(monitor)) = window.current_monitor() else {
        return;
    };
    let (Ok(position), Ok(size)) = (window.outer_position(), window.outer_size()) else {
        return;
    };
    // Enough of it has to be on screen for the user to see it and grab it; a sliver in the
    // corner is not a window anyone can use.
    let visible = |start: i32, length: u32, area: i32, extent: u32| -> i32 {
        (start + length as i32).min(area + extent as i32) - start.max(area)
    };
    let area = monitor.work_area();
    if visible(position.x, size.width, area.position.x, area.size.width) < 120
        || visible(position.y, size.height, area.position.y, area.size.height) < 80
    {
        let _ = window.center();
    }
}

/// What one report of a window's own geometry means for the placement the host remembers, and
/// what the host owes the window itself afterwards.
#[derive(Debug, PartialEq)]
enum Settlement {
    /// Nothing to write down: the user has not changed what the host remembers.
    Unchanged,
    /// The user's own geometry, remembered as it is reported.
    Placed(WindowState),
    /// The geometry a window reports as it comes back from a state the host could not size it in
    /// — maximized or minimized — with the user's own size kept in the record. What the window
    /// has now is whatever it had underneath that state, which can be a size only a plugin ever
    /// asked for, so the host still has to put back the size this content is meant to have
    /// (`restore_content_size`).
    Restored(WindowState),
}

/// `handed_back` is true for a report of the geometry a window comes back at after it has been in
/// a state the host could not size it in — what a minimized window reports as it is restored —
/// which is the geometry from underneath that state rather than a size the user chose.
fn settlement(
    previous: Option<&WindowState>,
    mut measured: WindowState,
    resized: bool,
    imposed: Option<(u32, u32)>,
    handed_back: bool,
) -> Settlement {
    if !resized {
        let baseline = previous
            .map(|state| (state.width, state.height))
            .unwrap_or((DEFAULT_INNER_SIZE.0 as u32, DEFAULT_INNER_SIZE.1 as u32));
        measured.width = baseline.0;
        measured.height = baseline.1;
    }
    // A geometry the OS handed back is answered even when the record needs no change: the window
    // itself still has to be sized again, and the record staying as it is is the point.
    if previous == Some(&measured) && !handed_back {
        return Settlement::Unchanged;
    }
    if handed_back || previous.is_some_and(|state| state.maximized) {
        // The event a window reports as it is restored gives whichever size it had underneath
        // the state it is coming back from, including a temporary plugin size. Keep the user's
        // baseline in the record, and let the host put the window's own size back afterwards.
        let mut restored = previous.cloned().unwrap_or_else(|| measured.clone());
        restored.x = measured.x;
        restored.y = measured.y;
        restored.maximized = false;
        return Settlement::Restored(restored);
    }
    if resized
        && imposed
            .is_some_and(|(width, height)| width == measured.width && height == measured.height)
    {
        return Settlement::Unchanged;
    }
    Settlement::Placed(measured)
}

/// Remember where the user leaves a window. Only the preview window is remembered: it is the
/// one they size and come back to, and the one whose placement the next run opens with.
///
/// The write is delayed until the window stops moving, so dragging an edge costs one write
/// rather than one per pixel. A minimized window has no placement of its own, and a maximized
/// one only records the flag: its size is the screen's, and the size to restore is the one it
/// had before it was maximized.
///
/// A window the OS gives back — un-maximized, or restored from the icon state — is sized again
/// (`restore_content_size`), because the geometry it comes back with is the one from underneath
/// the state it was in: a file whose content was fitted to the window before the user maximized or
/// minimized it would otherwise leave that shape behind for whatever is previewed next.
pub fn remember(window: &tauri::Window, resized: bool) {
    if window.label() != "preview" {
        return;
    }
    // Ask the window everything before taking the lock, never while holding it: a window call
    // is answered by the main thread, and this same call arrives from the main thread's window
    // event handler — which is where the lock is taken below.
    let (visible, minimized, maximized) = (
        window.is_visible().unwrap_or(false),
        window.is_minimized().unwrap_or(false),
        window.is_maximized().unwrap_or(false),
    );
    // Creation, baseline restoration and plugin preparation all resize a hidden window. None
    // of those events is a user choosing a new size or position.
    if !visible {
        return;
    }
    let desktop = window.app_handle().state::<Desktop>();
    if minimized {
        // Nothing about a window in the icon state is written down: it has no size of its own,
        // and the geometry it comes back at is the one already kept from before it went down.
        desktop.inner.lock().unwrap().put_aside = true;
        return;
    }
    let placed = (!maximized)
        .then(|| {
            let scale = window.scale_factor().ok()?;
            let position = window.outer_position().ok()?.to_logical::<f64>(scale);
            let size = window.inner_size().ok()?.to_logical::<f64>(scale);
            Some(WindowState {
                x: position.x.round() as i32,
                y: position.y.round() as i32,
                width: size.width.round().max(1.0) as u32,
                height: size.height.round().max(1.0) as u32,
                maximized: false,
            })
        })
        .flatten();
    // Whether the host owes this window a size of its own once the record below is written: the
    // geometry of a window that has just come back from the maximized state is not a size
    // anything asked for, so it is replaced by the one this content is meant to have.
    let mut refit = false;
    let flush = {
        let mut inner = desktop.inner.lock().unwrap();
        if maximized {
            // A maximized window reports the size of the screen, and what it comes back at is
            // answered through the record's own flag: whatever it was down for is behind it.
            inner.put_aside = false;
            match inner.window.as_mut() {
                Some(state) => state.maximized = true,
                None => return,
            }
        } else {
            let Some(measured) = placed else {
                return;
            };
            // The report of a window that has been down is the OS handing back the geometry from
            // underneath the icon state. A window cannot be resized while it is down, so that
            // geometry is what identifies it: it is kept out of the record, and the host answers
            // it by sizing the window again for the content that is showing now. Every other
            // report is this window's own, and the one the next hand-back is recognized by.
            let size = (measured.width, measured.height);
            let handed_back = inner.put_aside && inner.underneath == Some(size);
            if !handed_back {
                inner.put_aside = false;
                inner.underneath = Some(size);
            }
            // A size the host applied for a plugin's preparation is not a size the user chose:
            // recording it would make the next picture's fit start from this one, and a plugin
            // would be able to shrink the window the user set, one file at a time.
            let next = match settlement(
                inner.window.as_ref(),
                measured,
                resized,
                inner.imposing,
                handed_back,
            ) {
                Settlement::Unchanged => return,
                Settlement::Placed(next) => next,
                Settlement::Restored(next) => {
                    refit = true;
                    next
                }
            };
            inner.window = Some(next);
            // A window the OS gave back has not changed the user's size: their baseline is the
            // same one it was, and the active view still claims the size it declared.
            if resized && !refit {
                inner.note_user_resize();
            }
        }
        if inner.remembering {
            false
        } else {
            inner.remembering = true;
            true
        }
    };
    if refit {
        // Every window call is made out of the lock and from this main thread, which is the
        // thread that answers window and monitor calls.
        if let Some(preview) = window.app_handle().get_webview_window("preview") {
            restore_content_size(window.app_handle(), &preview);
        }
    }
    if !flush {
        return;
    }
    let app = window.app_handle().clone();
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(PLACEMENT_IDLE).await;
        let state = {
            let desktop = app.state::<Desktop>();
            let mut inner = desktop.inner.lock().unwrap();
            inner.remembering = false;
            inner.window.clone()
        };
        if let Err(error) = app.state::<Arc<Runtime>>().set_window_state(state).await {
            // Nothing here is worth interrupting the user for: the window is where they put it
            // for this run either way, and the next run falls back to the default size.
            eprintln!("Window placement: {error}");
        }
    });
}

pub fn last_path(app: &AppHandle) -> Option<PathBuf> {
    app.state::<Desktop>()
        .inner
        .lock()
        .unwrap()
        .last_path
        .clone()
}

/// Hand the file the preview window is showing to the application Windows associates with
/// it. It is the host's own way out of a preview: a file no installed plugin can draw is
/// still a file the user has a program for, and the host offers no editing of its own to
/// reach it with. Nothing about the preview changes — from here on the two views of the
/// file are independent, and the host cannot see what the other program does with it.
#[tauri::command]
pub async fn open_in_default_app(app: AppHandle) -> Result<(), String> {
    let path = last_path(&app).ok_or_else(|| text().open_default_missing.to_owned())?;
    open_external(&path).map_err(|error| fill(text().open_default_failed, &[("error", error)]))
}

/// Handing a path to the shell's default application for it.
#[cfg(windows)]
mod shell {
    use std::path::Path;
    use windows::{
        core::{w, PCWSTR},
        Win32::UI::{Shell::ShellExecuteW, WindowsAndMessaging::SW_SHOWNORMAL},
    };

    pub fn open(path: &Path) -> Result<(), String> {
        let file = wide(path);
        launch(&file)
    }

    /// Hand a web or mail address to whatever Windows opens it with. The same call serves a path
    /// and an address; what differs is who was allowed to name it (see `openable_link`).
    pub fn open_url(url: &str) -> Result<(), String> {
        let target = wide_text(url);
        launch(&target)
    }

    /// One `ShellExecuteW` for both, so the two cannot drift apart in how they report failure.
    ///
    /// SAFETY: the caller owns `target`, a NUL-terminated UTF-16 buffer, and keeps it alive for
    /// the call; the other arguments are the "open" verb and nulls, which is what the shell wants
    /// for the default verb with no arguments and no working directory.
    fn launch(target: &[u16]) -> Result<(), String> {
        let status = unsafe {
            ShellExecuteW(
                None,
                w!("open"),
                PCWSTR(target.as_ptr()),
                PCWSTR::null(),
                PCWSTR::null(),
                SW_SHOWNORMAL,
            )
        };
        // The shell answers with a handle on success and with a code at or below 32 on
        // failure, so the value is a status only at the low end of its range.
        let code = status.0 as isize;
        if code <= 32 {
            return Err(format!("ShellExecuteW returned {code}"));
        }
        Ok(())
    }

    /// The path as the shell reads it: UTF-16 and NUL-terminated, never lossy — a path this
    /// API cannot express exactly would name a different file.
    fn wide(path: &Path) -> Vec<u16> {
        use std::os::windows::ffi::OsStrExt;
        path.as_os_str().encode_wide().chain(Some(0)).collect()
    }

    /// The address as the shell reads it. Nothing is escaped or trimmed here: the string was
    /// checked before it got this far, and a NUL inside it would reach the shell as the prefix in
    /// front of that NUL.
    fn wide_text(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(Some(0)).collect()
    }

    #[cfg(test)]
    mod tests {
        use super::wide;
        use std::path::Path;

        #[test]
        fn a_path_reaches_the_shell_as_one_utf16_string() {
            // Spaces and non-ASCII names are the two things a hand-rolled conversion gets
            // wrong, and both are ordinary on Windows.
            let file = wide(Path::new("C:\\预览 图\\a b.png"));
            assert_eq!(file.last(), Some(&0));
            assert_eq!(
                String::from_utf16(&file[..file.len() - 1]).unwrap(),
                "C:\\预览 图\\a b.png"
            );
        }
    }
}

#[cfg(windows)]
use shell::open as open_external;

#[cfg(not(windows))]
fn open_external(_: &std::path::Path) -> Result<(), String> {
    Err("Opening a file with its default application is only implemented on Windows".into())
}

/// What a link may be, decided here rather than by the page that asked for it.
///
/// The shell is not a URL parser: it runs what it is handed, so an unexamined string out of a
/// document could start a program instead of opening a page. Only a web or mail address passes;
/// control characters are refused because the shell reads a NUL-terminated string, and the length
/// is bounded so a document cannot hand the shell an essay.
fn openable_link(url: &str) -> Result<&str, String> {
    let link = url.trim();
    if link.is_empty() || link.len() > 2048 {
        return Err("A link has to be between 1 and 2048 bytes".into());
    }
    if link.chars().any(char::is_control) {
        return Err("A link cannot contain control characters".into());
    }
    let (scheme, rest) = link
        .split_once(':')
        .ok_or_else(|| "A link needs a scheme".to_owned())?;
    match scheme.to_ascii_lowercase().as_str() {
        "http" | "https" if rest.starts_with("//") && rest.len() > 2 => Ok(link),
        "mailto" if !rest.is_empty() => Ok(link),
        _ => Err("Only http, https and mailto links can be opened".into()),
    }
}

/// Hand a link to the system, the way `open_in_default_app` hands it a file. This is the host's
/// other way out of a preview, and the only one a document's link has: a plugin page is sandboxed
/// and cannot navigate or open anything itself, so a link arrives here as text and is checked
/// before the shell ever sees it. Nothing about the preview changes, and the host cannot see what
/// the browser or the mail client does next.
pub fn open_external_url(url: &str) -> Result<(), String> {
    let link = openable_link(url)?;
    open_link(link)
}

#[cfg(windows)]
fn open_link(link: &str) -> Result<(), String> {
    shell::open_url(link)
}

#[cfg(not(windows))]
fn open_link(_: &str) -> Result<(), String> {
    Err("Opening a link is only implemented on Windows".into())
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
        .any(|s| s.file_id == file_id && s.pending)
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
        runtime.activate(Some(target.clone())).await?;
        let active = runtime
            .snapshot()
            .await
            .sessions
            .iter()
            .find(|session| session.id == target)
            .map(|session| (session.id.clone(), session.prepare));
        desktop.inner.lock().unwrap().active = active;
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
    // Leaving the view is not destruction, but it does hand the session back, so the same
    // claim that blocks uninstalling blocks this too — in the same words.
    if let Some(change) = snapshot
        .sessions
        .iter()
        .find(|s| s.id == id && s.pending)
        .map(PendingChange::from_info)
    {
        return Err(change.refusal(Refusal::Return));
    }
    let target = runtime.return_target(&id).await?;
    if desktop.current(revision) {
        runtime.activate(Some(target.clone())).await?;
        let active = snapshot
            .sessions
            .iter()
            .find(|session| session.id == target)
            .map(|session| (session.id.clone(), session.prepare));
        desktop.inner.lock().unwrap().active = active;
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
        let runtime = app.state::<Arc<Runtime>>();
        runtime.activate(id.clone()).await?;
        // The view on screen changed, so whether a window's opening waits for a preparation
        // changed with it. The window itself is already up, so nothing waits here.
        let active = match &id {
            Some(id) => runtime
                .snapshot()
                .await
                .sessions
                .iter()
                .find(|session| &session.id == id)
                .map(|session| (id.clone(), session.prepare)),
            None => None,
        };
        desktop.inner.lock().unwrap().active = active;
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
    let file = last_path(&app).map(|path| path.to_string_lossy().into_owned());
    DesktopSnapshot {
        snapshot,
        status,
        file,
    }
}
#[derive(Serialize)]
pub struct DesktopSnapshot {
    snapshot: Snapshot,
    status: Status,
    /// The file the preview window is showing, so the host's own file-scoped actions can
    /// tell whether they have anything to act on. Deliberately independent of the sessions:
    /// a file no plugin can preview is still a file the host can hand to another program.
    file: Option<String>,
}
#[tauri::command]
pub fn show_settings(app: AppHandle, page: Option<String>) -> Result<(), String> {
    let page = page
        .filter(|v| {
            matches!(v.as_str(), "general" | "plugins" | "about" | "welcome")
                || v.starts_with("tool:")
        })
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
        } else {
            // The user put the window away while its opening was still waiting for the plugin:
            // that waiting is over, and the window must not appear on its own afterwards.
            desktop.inner.lock().unwrap().holding = None;
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
pub fn reap(app: &AppHandle, pending: bool) {
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
            if pending && label == "preview" {
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
    // Read before any window exists, for the same reason the stored language is: the window is
    // created from it.
    let window = tauri::async_runtime::block_on(app.state::<Arc<Runtime>>().window_state());
    app.manage(Desktop {
        inner: Mutex::new(Inner {
            window,
            ..Default::default()
        }),
        ..Default::default()
    });
    let menu = tray_menu(app)?;
    let mut tray = TrayIconBuilder::with_id("ember-peek")
        .tooltip("Ember Peek")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "settings" => {
                let _ = show_settings(app.clone(), None);
            }
            #[cfg(debug_assertions)]
            "reset" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    let runtime = app.state::<Arc<Runtime>>();
                    if let Err(error) = runtime.reset_to_first_launch().await {
                        // The tray has nowhere else to report this, and the usual reason is
                        // a draft the developer has to deal with first.
                        eprintln!("Reset to first launch: {error}");
                        let _ = tauri::async_runtime::spawn_blocking(move || {
                            rfd::MessageDialog::new()
                                .set_title(text().dialog_reset_failed)
                                .set_description(error)
                                .set_buttons(rfd::MessageButtons::Ok)
                                .show()
                        })
                        .await;
                        return;
                    }
                    // The window opens with the remembered placement, so a reset has to forget
                    // that too — not only in the file, but in the copy this process still holds.
                    app.state::<Desktop>().inner.lock().unwrap().window = None;
                    // The chooser is what a first launch shows, so show it now rather than
                    // making the developer find the market themselves.
                    if let Err(error) = show_settings(app.clone(), Some("welcome".into())) {
                        eprintln!("Welcome window: {error}");
                    }
                });
            }
            "quit" => {
                let app = app.clone();
                tauri::async_runtime::spawn(async move {
                    if app.state::<Arc<Runtime>>().has_pending().await {
                        let t = text();
                        let discard = tauri::async_runtime::spawn_blocking(move || {
                            rfd::MessageDialog::new()
                                .set_title(t.dialog_pending_title)
                                .set_description(t.dialog_pending_note)
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

#[cfg(test)]
mod tests {
    use super::{openable_link, settlement, Inner, Settlement};
    use ember_runtime::WindowState;

    #[test]
    fn only_a_web_or_mail_address_reaches_the_shell() {
        // A page, and the two ordinary spellings of one: what a document may point at.
        for link in [
            "https://github.com/Ruszero01/ember-peek",
            "http://example.test/a?b=1#c",
            "HTTPS://EXAMPLE.TEST",
            "mailto:someone@example.test",
            "  https://example.test/a  ",
        ] {
            assert!(openable_link(link).is_ok(), "{link} should be openable");
        }
        // What may not: the shell runs what it is handed, so anything that names a local file, a
        // program, another scheme or nothing at all is refused here rather than passed on.
        for link in [
            "file:///C:/readme.txt",
            "C:\\notes\\todo.txt",
            "notes.txt",
            "ftp://example.test/a",
            "data:text/html,hello",
            "https:/example.test",
            "https://",
            "mailto:",
            "https://example.test/a\u{0}b",
            "https://example.test/a\nb",
            "",
            "   ",
        ] {
            assert!(openable_link(link).is_err(), "{link} should be refused");
        }
        assert!(openable_link(&format!("https://example.test/{}", "a".repeat(2048))).is_err());
    }

    fn state(x: i32, width: u32, height: u32) -> WindowState {
        WindowState {
            x,
            y: 40,
            width,
            height,
            maximized: false,
        }
    }

    #[test]
    fn preparation_keeps_the_hold_until_reveal_claims_it() {
        let mut inner = Inner {
            active: Some(("current".into(), true)),
            holding: Some(("current".into(), 7)),
            ..Default::default()
        };
        assert!(!inner.record_preparation("old", Some((800.0, 600.0))));
        assert!(!inner.prepared.contains_key("old"));
        assert!(inner.record_preparation("current", Some((800.0, 600.0))));
        assert_eq!(inner.holding, Some(("current".into(), 7)));
        assert!(inner.prepared.contains_key("current"));
        inner.hold_for_show("settings", false, 9);
        assert_eq!(inner.holding, Some(("current".into(), 7)));
        assert_eq!(inner.size_for_show("settings", false), None);
        assert_eq!(inner.size_for_show("preview", false), Some((800.0, 600.0)));
    }

    #[test]
    fn a_ready_preparation_without_a_size_is_still_recorded() {
        let mut inner = Inner {
            active: Some(("current".into(), true)),
            holding: Some(("current".into(), 7)),
            ..Default::default()
        };
        assert!(inner.record_preparation("current", None));
        assert!(inner
            .prepared
            .get("current")
            .is_some_and(|entry| entry.window.is_none()));
    }

    #[test]
    fn switching_a_visible_preview_uses_its_new_shape_once() {
        let mut inner = Inner {
            active: Some(("new".into(), true)),
            displayed: Some("old".into()),
            ..Default::default()
        };
        inner.prepared.insert(
            "old".into(),
            super::Prepared {
                window: Some((640.0, 440.0)),
                user_resized: false,
            },
        );
        inner.record_preparation("new", Some((195.0, 814.0)));
        assert_eq!(inner.size_for_show("preview", true), Some((195.0, 814.0)));
        inner.displayed = Some("new".into());
        assert_eq!(inner.size_for_show("preview", true), None);
        inner.note_user_resize();
        assert!(!inner.prepared.contains_key("old"));
        assert_eq!(inner.size_for_show("preview", false), None);
    }

    #[test]
    fn moving_a_framed_window_does_not_replace_the_users_size() {
        let previous = state(20, 1060, 740);
        let temporary = state(20, 640, 740);
        assert_eq!(
            settlement(
                Some(&previous),
                state(90, 640, 740),
                false,
                Some((640, 740)),
                false
            ),
            Settlement::Placed(state(90, 1060, 740))
        );
        assert_eq!(
            settlement(
                Some(&previous),
                temporary.clone(),
                true,
                Some((640, 740)),
                false
            ),
            Settlement::Unchanged
        );
        assert_eq!(
            settlement(
                Some(&previous),
                state(90, 900, 700),
                true,
                Some((640, 740)),
                false
            ),
            Settlement::Placed(state(90, 900, 700))
        );
    }

    #[test]
    fn the_window_the_os_gives_back_is_sized_again() {
        // The user maximized a window whose content had been fitted to it. What the window
        // reports once it is restored is that fitted shape, so the host has to size it again —
        // otherwise the shape of the last picture is what the next file opens in.
        let previous = state(20, 1060, 740);
        let maximized = WindowState {
            maximized: true,
            ..previous
        };
        assert_eq!(
            settlement(
                Some(&maximized),
                state(20, 640, 740),
                true,
                Some((640, 740)),
                false
            ),
            Settlement::Restored(state(20, 1060, 740))
        );
        // A minimized window is the same story from the other side: the host never sized it
        // while it was down, so the shape it reports as it comes back is a faded one — and it
        // must not be written down as the size the user chose.
        assert_eq!(
            settlement(
                Some(&previous),
                state(20, 640, 740),
                true,
                Some((640, 740)),
                true
            ),
            Settlement::Restored(state(20, 1060, 740))
        );
        // The first report a window gives as it is restored is a move, and it carries the size
        // the record already holds: the placement does not change, so this is the one report that
        // would otherwise leave the window at the shape it came back at.
        assert_eq!(
            settlement(
                Some(&previous),
                previous.clone(),
                false,
                Some((640, 740)),
                true
            ),
            Settlement::Restored(state(20, 1060, 740))
        );
    }

    #[test]
    fn the_view_showing_a_file_keeps_its_claim_on_the_window_size() {
        let mut inner = Inner {
            active: Some(("image".into(), true)),
            ..Default::default()
        };
        // A view that has declared nothing hands the window's size back to the user.
        assert_eq!(inner.claimed_for_active(), None);
        inner.record_preparation("image", Some((195.0, 814.0)));
        assert_eq!(inner.claimed_for_active(), Some((195.0, 814.0)));
        // The claim belongs to the view that is showing, not to the last one that declared.
        inner.record_preparation("stale", Some((800.0, 600.0)));
        assert!(!inner.prepared.contains_key("stale"));
        assert_eq!(inner.claimed_for_active(), Some((195.0, 814.0)));
        // Sizing the window by hand replaces the claim with the user's own size.
        inner.note_user_resize();
        assert_eq!(inner.claimed_for_active(), None);
    }
}
