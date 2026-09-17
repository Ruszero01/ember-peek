//! Native Explorer integration. Never reads keystroke text, clipboard or hidden-tab selections.
use std::{
    cell::RefCell,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, SyncSender},
        Arc,
    },
    thread,
    time::Duration,
};
use tauri::AppHandle;
use windows::{
    core::{Interface, Result},
    Win32::{
        Foundation::{HWND, LPARAM, LRESULT, WPARAM},
        System::{
            Com::{
                CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, IServiceProvider,
                CLSCTX_ALL, CLSCTX_INPROC_SERVER, COINIT_APARTMENTTHREADED,
            },
            LibraryLoader::GetModuleHandleW,
            Threading::GetCurrentThreadId,
            Variant::VARIANT,
        },
        UI::{
            Accessibility::{
                CUIAutomation, IUIAutomation, UIA_ComboBoxControlTypeId, UIA_EditControlTypeId,
            },
            Input::KeyboardAndMouse::{
                GetAsyncKeyState, VK_CONTROL, VK_LWIN, VK_MENU, VK_RWIN, VK_SHIFT, VK_SPACE,
            },
            Shell::{
                IFolderView2, IShellBrowser, IShellWindows, SID_STopLevelBrowser, ShellWindows,
                SIGDN_FILESYSPATH,
            },
            WindowsAndMessaging::*,
        },
    },
};

#[derive(Clone, Copy, PartialEq, Eq)]
struct Target {
    root: isize,
    view: isize,
    focus: isize,
}
fn hwnd(value: isize) -> HWND {
    HWND(value as *mut _)
}
unsafe fn class(window: HWND) -> String {
    let mut name = [0u16; 128];
    let count = GetClassNameW(window, &mut name);
    String::from_utf16_lossy(&name[..count.max(0) as usize])
}
// This runs in the hook: only Win32 metadata, no COM, file IO, IPC or WebView work.
unsafe fn target() -> Option<Target> {
    let root = GetForegroundWindow();
    if !matches!(class(root).as_str(), "CabinetWClass" | "ExploreWClass") {
        return None;
    }
    let mut gui = GUITHREADINFO {
        cbSize: std::mem::size_of::<GUITHREADINFO>() as u32,
        ..Default::default()
    };
    GetGUIThreadInfo(GetWindowThreadProcessId(root, None), &mut gui).ok()?;
    if gui.flags.0 != 0 {
        return None;
    } // Menus, move/size, etc.
    let focus = gui.hwndFocus;
    let mut parent = focus;
    for _ in 0..32 {
        if parent.0.is_null() || parent == root {
            return None;
        }
        let name = class(parent);
        if name.to_ascii_lowercase().contains("edit") {
            return None;
        }
        if name == "SHELLDLL_DefView" && IsWindowVisible(parent).as_bool() {
            return Some(Target {
                root: root.0 as isize,
                view: parent.0 as isize,
                focus: focus.0 as isize,
            });
        }
        parent = GetParent(parent).ok()?;
    }
    None
}
struct HookState {
    sender: SyncSender<Target>,
    consumed: bool,
}
thread_local! { static HOOK: RefCell<Option<HookState>> = const { RefCell::new(None) }; }
unsafe extern "system" fn keyboard(code: i32, wparam: WPARAM, lparam: LPARAM) -> LRESULT {
    if code == HC_ACTION as i32 {
        let key = &*(lparam.0 as *const KBDLLHOOKSTRUCT);
        if key.vkCode == VK_SPACE.0 as u32 && !key.flags.contains(LLKHF_INJECTED) {
            let consumed = HOOK.with(|cell| {
                let mut state = cell.borrow_mut();
                let Some(state) = state.as_mut() else {
                    return false;
                };
                if matches!(wparam.0 as u32, WM_KEYUP | WM_SYSKEYUP) {
                    return std::mem::take(&mut state.consumed);
                }
                if !matches!(wparam.0 as u32, WM_KEYDOWN | WM_SYSKEYDOWN) {
                    return false;
                }
                if state.consumed {
                    return true;
                } // One request per physical press.
                if [VK_CONTROL, VK_MENU, VK_SHIFT, VK_LWIN, VK_RWIN]
                    .iter()
                    .any(|key| GetAsyncKeyState(key.0 as i32) < 0)
                {
                    return false;
                }
                if let Some(target) = target() {
                    state.consumed = state.sender.try_send(target).is_ok();
                }
                state.consumed
            });
            if consumed {
                return LRESULT(1);
            }
        }
    }
    CallNextHookEx(None, code, wparam, lparam)
}

unsafe fn selection(expected: Target, automation: &IUIAutomation) -> Result<Option<PathBuf>> {
    if target() != Some(expected) {
        return Ok(None);
    }
    let control = automation.GetFocusedElement()?.CurrentControlType()?;
    if control == UIA_EditControlTypeId || control == UIA_ComboBoxControlTypeId {
        return Ok(None);
    }
    // ShellWindows can contain several tabs with the same top-level HWND.
    // Match the actual focused, visible IShellView HWND, never the first top-level match.
    let windows: IShellWindows = CoCreateInstance(&ShellWindows, None, CLSCTX_ALL)?;
    for index in 0..windows.Count()? {
        let candidate = (|| -> Result<Option<PathBuf>> {
            let dispatch = windows.Item(&VARIANT::from(index))?;
            let provider: IServiceProvider = dispatch.cast()?;
            let browser: IShellBrowser = provider.QueryService(&SID_STopLevelBrowser)?;
            let view = browser.QueryActiveShellView()?;
            let view_window = view.GetWindow()?;
            if view_window != hwnd(expected.view)
                || !IsWindowVisible(view_window).as_bool()
                || GetAncestor(view_window, GA_ROOT) != hwnd(expected.root)
            {
                return Ok(None);
            }
            let folder: IFolderView2 = view.cast()?;
            let selected = folder.GetSelection(false)?;
            if selected.GetCount()? == 0 {
                return Ok(None);
            }
            let item = selected.GetItemAt(0)?;
            let name = item.GetDisplayName(SIGDN_FILESYSPATH)?;
            let path = name.to_string();
            CoTaskMemFree(Some(name.0.cast()));
            let path = PathBuf::from(path?);
            if target() != Some(expected) {
                return Ok(None);
            }
            Ok(Some(path))
        })();
        if let Ok(Some(path)) = candidate {
            return Ok(Some(path));
        }
    }
    Ok(None)
}

pub struct Explorer {
    stop: Arc<AtomicBool>,
    hook_thread: u32,
}
impl Explorer {
    pub fn stop(&self) {
        self.stop.store(true, Ordering::Release);
        unsafe {
            let _ = PostThreadMessageW(self.hook_thread, WM_QUIT, WPARAM(0), LPARAM(0));
        }
    }
}
impl Drop for Explorer {
    fn drop(&mut self) {
        self.stop();
    }
}

pub fn start(app: AppHandle) -> std::result::Result<Explorer, String> {
    let (sender, receiver) = mpsc::sync_channel(1);
    let stop = Arc::new(AtomicBool::new(false));
    let worker_stop = stop.clone();
    let (worker_ready, ready) = mpsc::sync_channel(1);
    thread::Builder::new()
        .name("explorer-selection".into())
        .spawn(move || unsafe {
            let initialized = CoInitializeEx(None, COINIT_APARTMENTTHREADED).ok();
            if let Err(error) = initialized {
                let _ = worker_ready.send(Err(error.to_string()));
                return;
            }
            let automation: Result<IUIAutomation> =
                CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER);
            match automation {
                Err(error) => {
                    let _ = worker_ready.send(Err(error.to_string()));
                }
                Ok(automation) => {
                    let _ = worker_ready.send(Ok(()));
                    while !worker_stop.load(Ordering::Acquire) {
                        match receiver.recv_timeout(Duration::from_millis(100)) {
                            Ok(request) => match selection(request, &automation) {
                                Ok(Some(path)) if !worker_stop.load(Ordering::Acquire) => {
                                    let handle = app.clone();
                                    // Check again on the event loop: a slow shell provider must not open a stale tab.
                                    let _ = app.run_on_main_thread(move || {
                                        if target() != Some(request) {
                                            return;
                                        }
                                        tauri::async_runtime::spawn(async move {
                                            let _ = crate::desktop::open(&handle, path).await;
                                        });
                                    });
                                }
                                Err(error) => eprintln!("Explorer selection: {error}"),
                                _ => {}
                            },
                            Err(mpsc::RecvTimeoutError::Disconnected) => break,
                            Err(mpsc::RecvTimeoutError::Timeout) => {}
                        }
                        let mut message = MSG::default();
                        while PeekMessageW(&mut message, None, 0, 0, PM_REMOVE).as_bool() {
                            let _ = TranslateMessage(&message);
                            DispatchMessageW(&message);
                        }
                    }
                }
            }
            CoUninitialize();
        })
        .map_err(|e| e.to_string())?;
    ready.recv().map_err(|e| e.to_string())??;
    let (hook_ready, ready) = mpsc::sync_channel(1);
    let hook_stop = stop.clone();
    thread::Builder::new()
        .name("explorer-space-hook".into())
        .spawn(move || unsafe {
            let result = (|| -> Result<_> {
                let module = GetModuleHandleW(None)?;
                SetWindowsHookExW(WH_KEYBOARD_LL, Some(keyboard), Some(module.into()), 0)
            })();
            let hook = match result {
                Ok(hook) => hook,
                Err(error) => {
                    let _ = hook_ready.send(Err(error.to_string()));
                    return;
                }
            };
            HOOK.with(|cell| {
                *cell.borrow_mut() = Some(HookState {
                    sender,
                    consumed: false,
                })
            });
            let mut message = MSG::default();
            let _ = PeekMessageW(&mut message, None, 0, 0, PM_NOREMOVE); // Ensure stop can post to this queue.
            let _ = hook_ready.send(Ok(GetCurrentThreadId()));
            while !hook_stop.load(Ordering::Acquire) && GetMessageW(&mut message, None, 0, 0).0 > 0
            {
                let _ = TranslateMessage(&message);
                DispatchMessageW(&message);
            }
            let _ = UnhookWindowsHookEx(hook);
            HOOK.with(|cell| *cell.borrow_mut() = None);
        })
        .map_err(|e| {
            stop.store(true, Ordering::Release);
            e.to_string()
        })?;
    let hook_thread = ready.recv().map_err(|e| e.to_string())??;
    Ok(Explorer { stop, hook_thread })
}
