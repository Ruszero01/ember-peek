//! Validate release artifacts through the same parser, hash checks and extractor as the app.
use ember_runtime::{
    market::{Market, Source},
    Runtime,
};

#[tokio::main]
async fn main() {
    if let Err(error) = validate().await {
        eprintln!("{error}");
        std::process::exit(1);
    }
}

async fn validate() -> Result<(), String> {
    let directory = std::env::args_os()
        .nth(1)
        .ok_or("Usage: validate-catalog <release-directory>")?;
    let directory = std::fs::canonicalize(directory).map_err(|e| e.to_string())?;
    let temp = tempfile::tempdir().map_err(|e| e.to_string())?;
    let market = Market::new(
        Ok(vec![Source {
            name: Some("发布校验".into()),
            catalog: directory
                .join("catalog.json")
                .to_string_lossy()
                .into_owned(),
            base: directory.to_string_lossy().into_owned(),
        }]),
        temp.path().join("cache"),
    )?;
    let runtime = Runtime::new(temp.path().join("installed"))?;
    let list = market.list(&runtime).await?;
    if !list.warnings.is_empty() {
        return Err(list.warnings.join("\n"));
    }
    if list.entries.is_empty() {
        return Err("发布目录没有当前平台可安装的插件".into());
    }
    for entry in list.entries {
        market.prepare(&entry.id).await?;
        println!("Validated: {} {}", entry.id, entry.version);
    }
    Ok(())
}
