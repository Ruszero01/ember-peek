use std::{collections::BTreeMap, sync::LazyLock};
static ICONS: LazyLock<BTreeMap<String, String>> = LazyLock::new(|| {
    serde_json::from_str(include_str!("../../sdk/web/icons.json")).expect("generated icon catalog")
});
pub fn contains(name: &str) -> bool {
    ICONS.contains_key(name)
}
pub fn names(query: &str) -> Vec<String> {
    ICONS
        .keys()
        .filter(|name| name.contains(&query.to_ascii_lowercase()))
        .take(200)
        .cloned()
        .collect()
}
pub fn svg(name: &str) -> String {
    ICONS
        .get(name)
        .or_else(|| ICONS.get("package"))
        .cloned()
        .unwrap_or_default()
}
