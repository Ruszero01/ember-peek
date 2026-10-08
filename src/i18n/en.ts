// The English catalog doubles as the message-key definition: `typeof en` gives every
// valid key, and the other catalogs are typed against it, so a missing or misspelled
// translation is a compile error rather than a screen with a raw key on it.
//
// A value may be a string, or `{ one, other }` for a message whose wording depends on a
// `count` parameter. `{name}` placeholders are filled from the parameters passed to `t`.
export const en = {
  "plugins.createWithAI": "Create with AI",
  "plugins.noViewer": "No enabled viewer matches this file. Find a plugin or create one in Workshop.",
  "plugins.installFromFile": "Install package",
  "plugins.dropPackage.title": "Drop to install the plugin package",
  "plugins.dropPackage.note":
    "Only a .zip package; its manifest and permissions are shown before anything is installed.",
  "plugins.origin.local": "Local imports",
  "plugins.origin.official": "Official plugins",
  "plugins.origin.custom": "Custom plugins",
  "plugins.origin.market": "Third-party sources",
  "plugins.origin.generated": "AI generated",
  "plugins.origin.unknown": "Existing plugins · Legacy installation",
  "window.minimize": "Minimize",
  "window.maximize": "Maximize or restore",
  "window.close": "Close",
  "error.dismiss": "Dismiss",

  "browser.banner":
    "Interface preview · files and plugins need the desktop window",

  "empty.title": "A fleeting glance",
  "empty.note": "Drop a file here, or choose one to start previewing",
  "empty.open": "Open file",
  "empty.pluginsReady": {
    one: "{count} preview plugin is ready",
    other: "{count} preview plugins are ready",
  },
  "empty.noPlugins": "No preview plugin installed yet",
  "empty.manage": "Manage plugins",

  "loading.title": "Loading {name}",
  "loading.note":
    "You can open another file meanwhile; this one finishes in the background",
  "loading.file": "File",

  "preview.failed": "Plugin preview failed",
  "preview.openOther": "Open another file",
  "preview.tagline": "A fleeting glance",

  "footer.openDefaultApp": "Open in default app",
  "footer.openFile": "Open file",
  "footer.settings": "Settings",
  "footer.openPlugin": "Open {label}",

  "nav.heading": "Settings",
  "nav.about": "About",
  "nav.general": "General",
  "nav.plugins": "Plugins",
  "nav.pluginSettings": "Plugin settings",
  "nav.reorderHint": "Drag the handle to reorder",

  "plugin.enabled": "Enabled",
  "plugin.disabled": "Disabled",
  "plugin.disabledNote":
    "Disabled: this format cannot be opened while the plugin is off; its settings are kept",
  "plugin.disabledTitle": "{name} (disabled)",
  "plugin.enableLabel": "Enable {name}",
  "plugin.disabledBadge": "Disabled",
  "plugin.dragHint": "Drag to reorder",
  "plugin.dragLabel": "Reorder {name}",
  "plugin.order": "Load order {index}",
  "plugin.activation": "Activate automatically",
  "plugin.activationHint":
    "Activate automatically: when a file opens, its plugins are chosen in list order; with none marked automatic, whichever is available is used.",
  "plugin.settings.unavailable":
    "This plugin is no longer available; refresh the plugin list.",
  "plugin.settings.none": "This plugin declares no further settings.",
  "plugin.pidRunning": "Background process PID: {pids}",
  "plugin.runtimeRunning": "Running",

  "settings.increase": "Increase {label}",
  "settings.decrease": "Decrease {label}",
  "settings.browse": "Browse…",

  "appearance.title": "Appearance",
  "appearance.subtitle": "Interface theme",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "Follow system",

  "language.title": "Language",
  "language.subtitle": "Interface language",
  "language.system": "Follow system",
  "language.systemWith": "Follow system ({name})",
  "language.note":
    "Follows the system language when set to automatic. Plugin names and settings are shown in the language the plugin provides.",

  "interface.title": "Interface",
  "interface.subtitle": "How the preview window shows content",
  "immersive.label": "Immersive mode",
  "immersive.note":
    "Off, the viewport is the band between the title bar and the action bar. On, it fills the window: the bars appear when the pointer reaches the top or bottom edge, and the space they leave does not block the plugin.",

  "plugins.market": "Plugin marketplace",
  "plugins.openToolSettings": "Open settings ↗",
  "plugins.manage": "Plugin manager",
  "plugins.installedCount": {
    one: "{count} installed plugin",
    other: "{count} installed plugins",
  },
  "plugins.refresh": "Refresh",
  "plugins.searchPlaceholder": "Search plugins or extensions",
  "plugins.uninstall": "Uninstall",
  "plugins.uninstallLabel": "Uninstall {name}",
  "plugins.empty.title": "Let plugins bring new preview formats",
  "plugins.empty.note":
    "Install a plugin for text, images or another format, and its files open here.",
  "plugins.trustWarning":
    "A plugin carries a native executable, so install only from sources you trust.",
  "plugins.localName": "Local plugin",

  "progress.installLocal": "Verifying and installing the local plugin…",
  "progress.refreshPlugins": "Refreshing the plugin list…",

  "about.tagline": "A fleeting glance",
  "about.installed": "Installed plugins",
  "about.directory": "Plugin directory",
  "about.desktopOnly": "available in the desktop app",

  "welcome.title": "Welcome to Ember Peek",
  "welcome.note":
    "Pick the plugins to install; their files open right away, and you can add or remove them later in the marketplace.",
  "welcome.loading": "Loading the plugin list…",
  "welcome.retry": "Load the plugin list again",
  "welcome.allInstalled": "Every recommended basic plugin is installed.",
  "welcome.none": "This source offers no installable plugins.",
  "welcome.installing": "Installing {name} ({index}/{total})…",
  "welcome.failure": "{name}: {error}",
  "list.separator": "; ",
  "welcome.installingShort": "Installing…",
  "welcome.installSelected": {
    one: "Install {count} selected",
    other: "Install {count} selected",
  },
  "welcome.market": "Browse the marketplace",
  "welcome.later": "Not now",

  "market.update": "Update",
  "market.updateFrom": "Update from v{from} to v{to}",
  "market.source": "Source",
  "market.sourceLine": "Source: {source} · {size}",
  "market.install": "Install",
  "market.installing": "Installing…",
  "market.progress.download": "Downloading and verifying the plugin package…",
  "market.progress.install": "Installing the plugin…",
  "market.progress.refresh": "Refreshing the plugin list…",
  "market.refreshSources": "Refresh plugin sources",
  "market.sources": {
    one: "{count} source",
    other: "{count} sources",
  },
  "market.loading": "Reading the marketplace…",
  "market.group.available": "Not installed",
  "market.group.installed": "Installed",
  "market.manageHint": "Enable or uninstall in the plugin manager",
  "market.desktopOnly": "Browse and install plugins in the desktop window",
  "market.noMatch": "No plugin matches",
  "market.empty": "No plugin can be installed right now; try again later.",

  "confirm.install": "Install",
  "confirm.update": "Update",
  "confirm.uninstall": "Uninstall",
  "confirm.working.install": "Installing…",
  "confirm.working.update": "Updating…",
  "confirm.working.uninstall": "Uninstalling…",
  "confirm.title": "{action} {name}?",
  "confirm.uninstallNote":
    "Uninstalling removes this plugin's preview formats; it can be installed again from the marketplace at any time.",
  "confirm.installNote":
    "The package is verified and then installed on this machine. Plugins run native code, so make sure the source is one you trust.",
  "confirm.cancel": "Cancel",
  "confirm.processing": "Working…",
  "confirm.retry": "Retry",
  "confirm.submit": "Confirm {action}",

  "details.allFiles": "All files",
  "details.extensionCount": {
    one: "{count} file type supported",
    other: "{count} file types supported",
  },
  "details.show": "Details",

  "stage.overlays": "Plugin panels",
  "stage.dragHint": "Drag to move, double-click to reset",
  "stage.loading": "Loading…",

  "scrub.hint": "{label} · drag up to enlarge, down to shrink",

  "view.disconnected":
    "The plugin view never connected; check its entry page and scripts",
  "view.panelNoControls":
    "A panel cannot declare toolbar controls; they belong to the plugin view",
  "view.panelNoStatus":
    "A panel cannot report status; status belongs to the plugin view",
  "view.searchNotHost":
    "Search progress is no longer a host feature; show it in the plugin's own panel",
  "view.tooManyRequests": "Too many plugin requests, or an invalid request id",
  "view.panelNoSession":
    "A panel cannot change session state or the document; leave that to the plugin view",
  "view.onlyPrimaryNavigates": "Only the primary view owns navigation state",
  "view.onlyPrimaryPrepares": "Only the primary view can state a window size",
  "view.invalidPrepare": "Invalid window size declaration",
  "view.invalidPending": "Invalid pending flag",
  "view.invalidMethod": "Invalid method",
  "view.invalidReadRange": "Invalid file read range",
  "view.peerTarget": "A plugin-internal message must target view or panel",
  "view.peerTooLarge": "Plugin-internal message is too large",
  "view.invalidSettingKey": "Invalid setting key",
  "view.invalidPluginMethod": "Invalid plugin method",
  "view.clipboardTooLarge": "Clipboard content is over the limit",
  "view.invalidLink": "Invalid link",
  "view.unsupportedCapability": "Unsupported host capability",

  "protocol.tooManyControls": "A plugin may declare at most 16 controls",
  "protocol.invalidControlId": "Invalid plugin control id",
  "protocol.invalidControl": "Invalid plugin control declaration",
  "protocol.invalidScrubRange": "Invalid numeric scrub range",
  "protocol.invalidDialog": "Invalid plugin confirmation dialog",
  "protocol.workshopControlIcon": "Generated plugin controls must declare a Lucide icon",
  "protocol.workshopToggleState": "Generated plugin toggles must declare their current state",

  "bridge.desktopOnly": "Files and plugin processes need the desktop window",
};

/** Every valid message key: the English catalog is the source of truth for them. */
export type MessageKey = keyof typeof en;
/** One catalog entry: a plain message, or a pair chosen by a `count` parameter. */
export type Message = string | { one: string; other: string };
/** The shape every other catalog has to satisfy, key for key. */
export type Catalog = Record<MessageKey, Message>;

/** The English catalog, checked against itself: a key it is missing cannot be looked up. */
export const enCatalog: Catalog = en;
