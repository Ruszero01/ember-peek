//! Client-area capture of a host window, so the workshop's agent can look at the rendered
//! trial preview instead of guessing from text. This reads pixels only: nothing here sees
//! what the user typed, and the plugin package never gets a handle it could call.
#[cfg(windows)]
mod platform {
    use std::ffi::c_void;
    use tauri::WebviewWindow;
    use windows::Win32::{
        Foundation::{HWND, RECT},
        Graphics::Gdi::{
            CreateCompatibleBitmap, CreateCompatibleDC, DeleteDC, DeleteObject, GetDC, GetDIBits,
            ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS, HBITMAP,
            HDC, HGDIOBJ,
        },
        Storage::Xps::{PrintWindow, PRINT_WINDOW_FLAGS, PW_CLIENTONLY},
        UI::WindowsAndMessaging::{GetClientRect, PW_RENDERFULLCONTENT},
    };

    /// Largest area the capture accepts before it refuses, in pixels. A 4K window fits; a
    /// multi-monitor virtual surface does not, and neither would the model's context.
    const MAX_PIXELS: u64 = 6_000_000;

    /// Releases the window's device context, whichever way the capture ends.
    struct WindowDc(HDC, HWND);
    impl Drop for WindowDc {
        fn drop(&mut self) {
            unsafe {
                ReleaseDC(Some(self.1), self.0);
            }
        }
    }
    /// Releases a GDI object the capture allocated.
    struct Owned<T: Copy>(T, fn(T));
    impl<T: Copy> Drop for Owned<T> {
        fn drop(&mut self) {
            (self.1)(self.0);
        }
    }
    fn delete_dc(dc: HDC) {
        unsafe {
            let _ = DeleteDC(dc);
        }
    }
    fn delete_bitmap(bitmap: HBITMAP) {
        unsafe {
            let _ = DeleteObject(HGDIOBJ(bitmap.0));
        }
    }

    /// PNG of the window's client area. The window is raised first: a minimized window has
    /// no composition surface left to copy, so an empty frame would otherwise be reported
    /// as a successful screenshot of nothing.
    pub async fn png(window: &WebviewWindow) -> Result<Vec<u8>, String> {
        let _ = window.unminimize();
        let _ = window.show();
        // The compositor needs a frame after a show before there is anything to copy.
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        let hwnd = window.hwnd().map_err(|e| e.to_string())?;
        // The handle travels as an integer: a raw pointer is not `Send`, and the blocking
        // worker is a different thread from the one that asked for the capture.
        let raw = hwnd.0 as isize;
        tauri::async_runtime::spawn_blocking(move || capture(HWND(raw as _)))
            .await
            .map_err(|e| e.to_string())?
    }

    fn capture(hwnd: HWND) -> Result<Vec<u8>, String> {
        unsafe {
            let mut rect = RECT::default();
            GetClientRect(hwnd, &mut rect).map_err(|e| e.to_string())?;
            let width = (rect.right - rect.left).max(0) as u32;
            let height = (rect.bottom - rect.top).max(0) as u32;
            if width < 8 || height < 8 {
                return Err("试预览窗口还没有内容，请先打开它再截图".into());
            }
            if u64::from(width) * u64::from(height) > MAX_PIXELS {
                return Err("试预览窗口太大，无法截图；请缩小窗口后重试".into());
            }
            let reference = GetDC(Some(hwnd));
            if reference.is_invalid() {
                return Err("无法读取试预览窗口的设备上下文".into());
            }
            let _reference = WindowDc(reference, hwnd);
            let memory = Owned(CreateCompatibleDC(Some(reference)), delete_dc);
            if memory.0.is_invalid() {
                return Err("无法创建截图缓冲区".into());
            }
            let bitmap = Owned(
                CreateCompatibleBitmap(reference, width as i32, height as i32),
                delete_bitmap,
            );
            if bitmap.0.is_invalid() {
                return Err("无法创建截图位图".into());
            }
            let previous = SelectObject(memory.0, HGDIOBJ(bitmap.0 .0));
            // PW_RENDERFULLCONTENT asks the compositor for the window's real content: a
            // WebView2 surface is not painted into the window DC, so a plain BitBlt is empty.
            let printed = PrintWindow(
                hwnd,
                memory.0,
                PRINT_WINDOW_FLAGS(PW_CLIENTONLY.0 | PW_RENDERFULLCONTENT),
            );
            let pixels = (width as usize) * (height as usize);
            let mut buffer = vec![0u8; pixels * 4];
            let mut info = BITMAPINFO::default();
            info.bmiHeader.biSize = std::mem::size_of::<BITMAPINFOHEADER>() as u32;
            info.bmiHeader.biWidth = width as i32;
            // A negative height asks for a top-down buffer, which is the order PNG wants.
            info.bmiHeader.biHeight = -(height as i32);
            info.bmiHeader.biPlanes = 1;
            info.bmiHeader.biBitCount = 32;
            info.bmiHeader.biCompression = BI_RGB.0;
            let copied = if printed.as_bool() {
                GetDIBits(
                    memory.0,
                    bitmap.0,
                    0,
                    height,
                    Some(buffer.as_mut_ptr() as *mut c_void),
                    &mut info,
                    DIB_RGB_COLORS,
                )
            } else {
                0
            };
            SelectObject(memory.0, previous);
            if copied == 0 {
                return Err("截图失败，请把试预览窗口置于前台后重试".into());
            }
            // A frame without a single differing pixel is a compositor placeholder, not a
            // preview: reporting it as a screenshot would let the agent "fix" a black screen.
            if uniform(&buffer) {
                return Err("截图为空白：请打开试预览窗口并让它显示在最前面，然后重试".into());
            }
            // The capture is opaque; alpha from a composited frame is not meaningful.
            let mut rgba = Vec::with_capacity(pixels * 4);
            for pixel in buffer.as_chunks::<4>().0 {
                rgba.extend_from_slice(&[pixel[2], pixel[1], pixel[0], 255]);
            }
            encode(width, height, &rgba)
        }
    }

    fn uniform(buffer: &[u8]) -> bool {
        let Some(first) = buffer.first_chunk::<4>() else {
            return true;
        };
        let first: &[u8] = first;
        buffer
            .as_chunks::<4>()
            .0
            .iter()
            .step_by(37)
            .all(|pixel| pixel == first)
    }

    fn encode(width: u32, height: u32, rgba: &[u8]) -> Result<Vec<u8>, String> {
        let mut out = Vec::new();
        let mut encoder = png::Encoder::new(&mut out, width, height);
        encoder.set_color(png::ColorType::Rgba);
        encoder.set_depth(png::BitDepth::Eight);
        let mut writer = encoder.write_header().map_err(|e| e.to_string())?;
        writer.write_image_data(rgba).map_err(|e| e.to_string())?;
        drop(writer);
        Ok(out)
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn a_captured_frame_is_written_as_a_readable_png() {
            let pixels = [
                255u8, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 9, 9, 9, 255,
            ];
            let png = encode(2, 2, &pixels).unwrap();
            assert_eq!(&png[..4], b"\x89PNG");
            // What the model receives has to decode back to what the window showed.
            let mut reader = png::Decoder::new(png.as_slice()).read_info().unwrap();
            let mut buffer = vec![0; reader.output_buffer_size()];
            let info = reader.next_frame(&mut buffer).unwrap();
            assert_eq!((info.width, info.height), (2, 2));
            assert_eq!(&buffer[..info.buffer_size()], &pixels);
        }

        #[test]
        fn a_frame_without_a_single_differing_pixel_is_treated_as_empty() {
            let mut pixels = vec![10u8; 40 * 40 * 4];
            assert!(uniform(&pixels));
            pixels[37 * 4] = 200;
            assert!(!uniform(&pixels));
            assert!(uniform(&[]));
        }
    }
}

#[cfg(windows)]
pub use platform::png;

#[cfg(not(windows))]
pub async fn png(_: &tauri::WebviewWindow) -> Result<Vec<u8>, String> {
    Err("Preview capture is only implemented on Windows".into())
}
