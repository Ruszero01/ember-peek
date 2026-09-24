//! Sizing the preview window to what a plugin says it is showing.
//!
//! The split is the same one the rest of the host follows: the plugin knows the content and
//! decides what size shows it well, the host knows the window, the screen and what a window may
//! be. A plugin therefore *declares a size* (its view asks for it before the window is shown)
//! and the host only constrains that size — it never picks one, never moves the window, and
//! never writes a declared size down as the user's own. Nothing here is a mode: a window has one
//! size at a time, and the next declaration replaces it.

/// A size the host will apply, in CSS pixels, and whether it still has the declared shape.
/// A short side below the host floor grows together with the long side. If that would exceed
/// the available screen area, the screen wins and `exact` becomes false so the view can fit.
pub fn clamp(declared: (f64, f64), available: (f64, f64), minimum: (f64, f64)) -> (f64, f64, bool) {
    let (mut width, mut height) = declared;
    // The declaration is fitted to the room there is, both axes together: shrinking only the
    // axis that overflowed would trade a window that does not fit for content that no longer
    // fills it.
    let scale = (available.0 / width).min(available.1 / height).min(1.0);
    if scale < 1.0 {
        width *= scale;
        height *= scale;
    }
    // Give the chrome enough room by growing both axes together. A portrait that needs a
    // wider minimum therefore becomes proportionally taller whenever the screen has room.
    let grow = (minimum.0 / width).max(minimum.1 / height).max(1.0);
    width *= grow;
    height *= grow;
    // When that growth cannot fit on screen, keep the minimum usable short side and cap the
    // other side at the work area. The view will letterbox rather than crop or stretch.
    width = width.min(available.0.max(minimum.0));
    height = height.min(available.1.max(minimum.1));
    let (width, height) = (width.round().max(1.0), height.round().max(1.0));
    let declared_aspect = declared.0 / declared.1;
    let exact = if declared.0 >= declared.1 {
        (height - width / declared_aspect).abs() <= 1.0
    } else {
        (width - height * declared_aspect).abs() <= 1.0
    };
    (width, height, exact)
}

/// The room a window at `position` has, in CSS pixels: the work area of the monitor it belongs
/// to, with the taskbar taken out. `None` when the host cannot ask — a window that has never
/// been placed is centered, and the primary monitor is what it is centered on.
pub fn room(app: &tauri::AppHandle, position: (i32, i32)) -> Option<(f64, f64)> {
    let monitor = app
        .monitor_from_point(position.0 as f64, position.1 as f64)
        .ok()
        .flatten()?;
    let area = monitor.work_area();
    let right = area.position.x as f64 + area.size.width as f64;
    let bottom = area.position.y as f64 + area.size.height as f64;
    let scale = monitor.scale_factor();
    Some((
        ((right - position.0 as f64) / scale).max(1.0),
        ((bottom - position.1 as f64) / scale).max(1.0),
    ))
}

/// Whether a declaration survives being asked for: two finite numbers above zero. A plugin that
/// declares something else is refused rather than guessed at.
pub fn valid(width: f64, height: f64) -> bool {
    width.is_finite() && height.is_finite() && width >= 1.0 && height >= 1.0
}

#[cfg(test)]
mod tests {
    use super::clamp;
    use crate::desktop::MIN_PREVIEW_SIZE;

    /// A 1920x1040 screen above a taskbar, with the host's own smallest window.
    const ROOM: (f64, f64) = (1920.0, 1040.0);
    const FLOOR: (f64, f64) = (640.0, 440.0);

    #[test]
    fn a_declaration_that_fits_is_applied_as_asked() {
        assert_eq!(clamp((1060.0, 795.0), ROOM, FLOOR), (1060.0, 795.0, true));
    }

    #[test]
    fn a_declaration_larger_than_the_screen_keeps_its_shape() {
        // 4000x3000 would not fit any screen. Both axes shrink together, so the content still
        // fills the window it was declared for; only the size changed, not the shape.
        let (width, height, exact) = clamp((4000.0, 3000.0), ROOM, FLOOR);
        assert_eq!((width, height), (1387.0, 1040.0));
        assert!(exact);
    }

    #[test]
    fn a_declaration_below_the_host_floor_is_refused_a_shape_it_cannot_have() {
        // Raising the panorama's height proportionally would push its width past the screen.
        let (width, height, exact) = clamp((1060.0, 18.0), ROOM, FLOOR);
        assert_eq!((width, height), (1920.0, 440.0));
        assert!(!exact);
    }

    #[test]
    fn a_declaration_below_the_floor_is_raised_to_it() {
        // A very narrow window grows both axes, until the screen caps the long side.
        let (width, height, exact) = clamp((120.0, 680.0), ROOM, FLOOR);
        assert_eq!((width, height), (640.0, 1040.0));
        assert!(!exact);
    }

    #[test]
    fn a_portrait_grows_to_the_minimum_width_without_changing_shape() {
        assert_eq!(
            clamp((240.0, 600.0), ROOM, MIN_PREVIEW_SIZE),
            (320.0, 800.0, true)
        );
    }

    #[test]
    fn a_long_screenshot_keeps_the_minimum_width_and_stays_on_screen() {
        assert_eq!(
            clamp((195.0, 814.0), ROOM, MIN_PREVIEW_SIZE),
            (320.0, 1040.0, false)
        );
    }

    #[test]
    fn a_wide_image_grows_to_the_minimum_height_without_changing_shape() {
        assert_eq!(
            clamp((960.0, 150.0), ROOM, MIN_PREVIEW_SIZE),
            (1536.0, 240.0, true)
        );
    }

    #[test]
    fn a_wide_image_stays_on_screen_when_minimum_height_would_make_it_too_wide() {
        assert_eq!(
            clamp((960.0, 150.0), (1100.0, 1040.0), MIN_PREVIEW_SIZE),
            (1100.0, 240.0, false)
        );
    }
}
