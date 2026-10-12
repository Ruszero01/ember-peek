use std::{env, path::PathBuf};

fn main() {
    println!("cargo:rustc-check-cfg=cfg(cineware)");
    println!("cargo:rerun-if-changed=src/cineware.cpp");
    println!("cargo:rerun-if-env-changed=EMBER_CINEWARE_SDK");
    if env::var("CARGO_CFG_TARGET_OS").as_deref() != Ok("windows") {
        return;
    }
    let root = PathBuf::from(env::var_os("CARGO_MANIFEST_DIR").unwrap());
    let sdk = env::var_os("EMBER_CINEWARE_SDK")
        .map(PathBuf::from)
        .unwrap_or_else(|| root.join("../../../target/cineware-sdk"));
    assert!(
        sdk.join("includes/c4d.h").is_file(),
        "Run npm run model:sdk before building, or set EMBER_CINEWARE_SDK to Cineware S22.008"
    );
    cc::Build::new()
        .cpp(true)
        .file("src/cineware.cpp")
        .include(sdk.join("includes"))
        .flag_if_supported("/std:c++17")
        .flag_if_supported("/wd4819")
        .warnings(false)
        .compile("ember_cineware_bridge");
    println!(
        "cargo:rustc-link-search=native={}",
        sdk.join("libraries/win/cinewarelib_2019").display()
    );
    println!(
        "cargo:rustc-link-search=native={}",
        sdk.join("libraries/win/jpeglib_2019").display()
    );
    for lib in ["cinewarelib_release", "jpeglib_release"] {
        println!("cargo:rustc-link-lib=static={lib}");
    }
    for lib in ["ws2_32", "winmm", "ole32"] {
        println!("cargo:rustc-link-lib={lib}");
    }
    println!("cargo:rustc-cfg=cineware");
}
