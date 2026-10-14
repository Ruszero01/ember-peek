/// Preparing a hidden preview still needs its normal rendering resources.
pub fn should_reduce(visible: bool, minimized: bool, preparing: bool) -> bool {
    !preparing && (!visible || minimized)
}

/// Ask WebView2 to release caches without pausing scripts, IPC or unsaved work.
pub fn set_reduced(window: &tauri::WebviewWindow, reduced: bool) {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_19, COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW,
            COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL,
        };
        use windows::core::Interface;

        // Tauri dispatches this closure to the WebView's owning thread. Older runtimes
        // may not expose this optional interface; keep their existing behavior.
        let _ = window.with_webview(move |webview| unsafe {
            let Ok(core) = webview.controller().CoreWebView2() else {
                return;
            };
            let Ok(memory) = core.cast::<ICoreWebView2_19>() else {
                return;
            };
            let target = if reduced {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_LOW
            } else {
                COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL
            };
            let mut current = COREWEBVIEW2_MEMORY_USAGE_TARGET_LEVEL_NORMAL;
            if memory.MemoryUsageTargetLevel(&mut current).is_ok() && current != target {
                let _ = memory.SetMemoryUsageTargetLevel(target);
            }
        });
    }
    #[cfg(not(windows))]
    let _ = (window, reduced);
}

#[cfg(test)]
mod tests {
    use super::should_reduce;

    #[test]
    fn hidden_and_minimized_windows_reduce_memory() {
        assert!(should_reduce(false, false, false));
        assert!(should_reduce(true, true, false));
        assert!(should_reduce(false, true, false));
    }

    #[test]
    fn visible_and_preparing_windows_keep_normal_memory() {
        assert!(!should_reduce(true, false, false));
        for (visible, minimized) in [(false, false), (false, true), (true, true)] {
            assert!(!should_reduce(visible, minimized, true));
        }
    }
}
