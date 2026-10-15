//! The rar decoder is the reference C++ implementation, and the parts of it this plugin
//! links — the archive reader and the header walker — reach into the Win32 security and
//! registry APIs for file attributes. Nothing else here needs a system library.
fn main() {
    if std::env::var("CARGO_CFG_WINDOWS").is_ok() {
        println!("cargo:rustc-link-lib=advapi32");
    }
}
