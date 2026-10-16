// Frozen from v0.1.0 (c51e9aaa), preserving the shipped strict catalog parser.

use serde::Deserialize;
use serde_json::Value;
use std::collections::BTreeMap;
#[derive(Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Catalog {
    api: u32,
    /// Reserved for catalog signatures. Parsed only to be refused; see `check_signature`
    /// for why that is the honest behaviour today.
    #[serde(default)]
    signature: Option<Value>,
    entries: Vec<Listing>,
}

#[derive(Clone, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Listing {
    id: String,
    summary: String,
    publisher: String,
    /// Published artifact. The catalog is the index, so it carries what a market card
    /// needs before anything is downloaded: the display fields, and the build identity
    /// the download is confirmed against afterwards.
    artifact: String,
    sha256: String,
    size: u64,
    version: String,
    build_id: String,
    #[serde(default)]
    targets: Vec<String>,
    /// Suggested by the source for a fresh installation, so the first-run chooser can
    /// offer a few basics instead of the whole catalog.
    #[serde(default)]
    recommended: bool,
    #[serde(default)]
    name: Option<String>,
    /// The entry's display text per language, published from the plugin's own manifest and
    /// listing. A language that is absent reads as the base fields, so a catalog published
    /// before a plugin had a translation still works.
    #[serde(default)]
    i18n: BTreeMap<String, ListingText>,
    #[serde(default)]
    extensions: Option<Vec<String>>,
    #[serde(default)]
    icon: Option<String>,
    #[serde(default)]
    beta: bool,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct ListingText {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    summary: Option<String>,
}

pub fn accepts(bytes: &[u8]) -> bool {
    serde_json::from_slice::<Catalog>(bytes).is_ok_and(|catalog| catalog.api == 1 && catalog.entries.len() <= 256 && catalog.signature.is_none())
}
