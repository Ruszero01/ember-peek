//! "Start with Windows" is one value in the current user's Run key.
//!
//! The registry is the only store for this setting: nothing about it is remembered in
//! `host-state.json`, because a second copy could disagree with what Windows actually does
//! at sign-in. Task Manager's Startup tab shows the same entry and can disable it, so this
//! module also clears that separate state when the setting is turned on.
//!
//! Running the entry only starts the tray process. Nothing opens a window on its own: the
//! preview and settings windows are created on demand, from the tray or from Explorer.
use std::path::{Path, PathBuf};

/// Where Windows looks for the programs it starts at sign-in, per user.
const RUN_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Run";
/// Explorer's own state for those entries — what Task Manager's "disabled" writes. A value
/// only exists here once that tab (or another tool) has been used on the entry.
const APPROVAL_KEY: &str =
    r"Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run";
/// The value name. Stable on purpose: renaming it would leave the old entry behind and start
/// two copies of the app at sign-in.
const VALUE: &str = "Ember Peek";

/// The command line Windows runs. Always quoted: the default install path contains a space,
/// and an unquoted `C:\Program Files\...\ember-peek.exe` is not something Windows can find.
fn command(exe: &Path) -> String {
    format!("\"{}\"", exe.display())
}

/// Whether a stored Run value names this executable. The comparison ignores case because
/// Windows paths do, so an entry written by another copy of the app — the same install
/// spelled differently, or a path that was moved — must not read as "off" and then be
/// written again under a second name.
fn targets(stored: &str, exe: &Path) -> bool {
    let stored = stored.trim();
    // This module always writes a quoted command. A value edited by hand may not be quoted,
    // in which case the whole text is the command and only an exact match counts.
    let recorded = match stored.strip_prefix('"') {
        Some(rest) => rest.split('"').next().unwrap_or(rest),
        None => stored,
    };
    recorded.eq_ignore_ascii_case(&exe.display().to_string())
}

/// A `REG_SZ` value as the bytes the registry holds: UTF-16, terminated by a null unit.
fn encode(value: &str) -> Vec<u8> {
    value
        .encode_utf16()
        .chain(std::iter::once(0))
        .flat_map(u16::to_le_bytes)
        .collect()
}

/// The text of a `REG_SZ` value, from the bytes the registry returned.
fn decode(data: &[u8]) -> String {
    let units: Vec<u16> = data
        .chunks_exact(2)
        .map(|pair| u16::from_le_bytes([pair[0], pair[1]]))
        .collect();
    let end = units
        .iter()
        .position(|unit| *unit == 0)
        .unwrap_or(units.len());
    String::from_utf16_lossy(&units[..end])
}

/// This executable, as the registry should name it. Not canonicalized: canonicalizing a
/// Windows path adds a `\\?\` prefix that the command line does not need and that would make
/// the stored value differ from the one the user sees in Task Manager.
fn executable() -> Result<PathBuf, String> {
    std::env::current_exe().map_err(|error| error.to_string())
}

#[cfg(windows)]
mod registry {
    use super::{APPROVAL_KEY, RUN_KEY};
    use windows::core::PCWSTR;
    use windows::Win32::Foundation::{ERROR_FILE_NOT_FOUND, ERROR_SUCCESS, WIN32_ERROR};
    use windows::Win32::System::Registry::{
        RegCloseKey, RegDeleteValueW, RegOpenKeyExW, RegQueryValueExW, RegSetValueExW, HKEY,
        HKEY_CURRENT_USER, KEY_QUERY_VALUE, KEY_SET_VALUE, REG_SAM_FLAGS, REG_SZ, REG_VALUE_TYPE,
    };

    pub(super) fn code(status: WIN32_ERROR) -> String {
        format!("0x{:08X}", status.0)
    }

    fn wide(text: &str) -> Vec<u16> {
        text.encode_utf16().chain(std::iter::once(0)).collect()
    }

    /// An open key, closed when it goes out of scope. Every path out of here has to close it:
    /// a leaked handle keeps the key's hive mapped for the life of the process.
    struct Key(HKEY);
    impl Drop for Key {
        fn drop(&mut self) {
            unsafe {
                let _ = RegCloseKey(self.0);
            }
        }
    }

    fn open(path: &str, access: REG_SAM_FLAGS) -> Result<Option<Key>, String> {
        let path = wide(path);
        let mut key = HKEY::default();
        let status = unsafe {
            RegOpenKeyExW(
                HKEY_CURRENT_USER,
                PCWSTR(path.as_ptr()),
                None,
                access,
                &mut key,
            )
        };
        match status {
            ERROR_SUCCESS => Ok(Some(Key(key))),
            // The Run key exists on every Windows install; a missing one is not an error to
            // report, it is a value that is not there.
            ERROR_FILE_NOT_FOUND => Ok(None),
            other => Err(code(other)),
        }
    }

    /// The command line stored under `name`, or `None` when the entry is absent.
    pub(super) fn read(name: &str) -> Result<Option<String>, String> {
        let Some(key) = open(RUN_KEY, KEY_QUERY_VALUE)? else {
            return Ok(None);
        };
        let name = wide(name);
        let mut kind = REG_VALUE_TYPE::default();
        let mut size = 0u32;
        let status = unsafe {
            RegQueryValueExW(
                key.0,
                PCWSTR(name.as_ptr()),
                None,
                Some(&mut kind),
                None,
                Some(&mut size),
            )
        };
        if status == ERROR_FILE_NOT_FOUND {
            return Ok(None);
        }
        if status != ERROR_SUCCESS {
            return Err(code(status));
        }
        if size == 0 {
            return Ok(Some(String::new()));
        }
        let mut data = vec![0u8; size as usize];
        let status = unsafe {
            RegQueryValueExW(
                key.0,
                PCWSTR(name.as_ptr()),
                None,
                Some(&mut kind),
                Some(data.as_mut_ptr()),
                Some(&mut size),
            )
        };
        if status != ERROR_SUCCESS {
            return Err(code(status));
        }
        data.truncate(size as usize);
        Ok(Some(super::decode(&data)))
    }

    /// Write the entry, replacing whatever it held. The key is opened with write access
    /// rather than created: `HKCU\...\Run` is part of a normal user profile, and creating a
    /// missing one would mean writing an entry Windows never reads.
    pub(super) fn write(name: &str, value: &str) -> Result<(), String> {
        let Some(key) = open(RUN_KEY, KEY_SET_VALUE)? else {
            return Err(code(ERROR_FILE_NOT_FOUND));
        };
        let name = wide(name);
        let data = super::encode(value);
        let status =
            unsafe { RegSetValueExW(key.0, PCWSTR(name.as_ptr()), None, REG_SZ, Some(&data)) };
        if status != ERROR_SUCCESS {
            return Err(code(status));
        }
        Ok(())
    }

    /// Remove the entry. Absent is the state the caller asked for, so it is not an error.
    pub(super) fn remove(name: &str) -> Result<(), String> {
        let Some(key) = open(RUN_KEY, KEY_SET_VALUE)? else {
            return Ok(());
        };
        let name = wide(name);
        let status = unsafe { RegDeleteValueW(key.0, PCWSTR(name.as_ptr())) };
        match status {
            ERROR_SUCCESS | ERROR_FILE_NOT_FOUND => Ok(()),
            other => Err(code(other)),
        }
    }

    /// Forget Task Manager's state. A refusal must reach the caller: a Run value alone
    /// does not guarantee Windows will launch an entry that Explorer has disabled.
    pub(super) fn clear_approval(name: &str) -> Result<(), String> {
        let Some(key) = open(APPROVAL_KEY, KEY_SET_VALUE)? else {
            return Ok(());
        };
        let name = wide(name);
        let status = unsafe { RegDeleteValueW(key.0, PCWSTR(name.as_ptr())) };
        match status {
            ERROR_SUCCESS | ERROR_FILE_NOT_FOUND => Ok(()),
            other => Err(code(other)),
        }
    }
}

/// Whether this app is set to start when the user signs in, according to the registry.
///
/// A stored value that names a different executable reads as off: this setting is about
/// *this* copy of the app, and an entry left behind by a removed one is not a promise that
/// anything will start.
pub fn enabled() -> Result<bool, String> {
    let exe = executable()?;
    #[cfg(windows)]
    {
        Ok(registry::read(VALUE)?.is_some_and(|stored| targets(&stored, &exe)))
    }
    #[cfg(not(windows))]
    {
        let _ = exe;
        Ok(false)
    }
}

/// Turn the entry on or off, and report what Windows refused to do rather than what was
/// asked for. Nothing is remembered here: the next read comes from the registry again.
pub fn set(enabled: bool) -> Result<(), String> {
    #[cfg(windows)]
    {
        if enabled {
            let command = command(&executable()?);
            registry::clear_approval(VALUE)?;
            registry::write(VALUE, &command)?;
        } else {
            registry::clear_approval(VALUE)?;
            registry::remove(VALUE)?;
        }
        Ok(())
    }
    #[cfg(not(windows))]
    {
        let _ = enabled;
        Err(ember_runtime::i18n::text().autostart_unsupported.to_owned())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_stored_command_is_quoted_so_a_path_with_spaces_can_be_found() {
        assert_eq!(
            command(Path::new(r"C:\Program Files\Ember Peek\ember-peek.exe")),
            r#""C:\Program Files\Ember Peek\ember-peek.exe""#
        );
    }

    #[test]
    fn only_an_entry_that_names_this_executable_reads_as_on() {
        let exe = Path::new(r"C:\Users\me\AppData\Local\Ember Peek\ember-peek.exe");
        assert!(targets(&command(exe), exe));
        // The registry keeps the spelling it was given, and Windows paths are case-insensitive.
        assert!(targets(
            r#""c:\users\ME\appdata\local\ember peek\EMBER-PEEK.EXE""#,
            exe
        ));
        // Another install, an old path, or an entry that starts something else entirely.
        assert!(!targets(
            r#""C:\Program Files\Ember Peek\ember-peek.exe""#,
            exe
        ));
        assert!(!targets("", exe));
        assert!(!targets("ember-peek.exe", exe));
    }

    #[test]
    fn a_hand_written_entry_without_quotes_is_read_as_it_stands() {
        let exe = Path::new(r"C:\Tools\ember-peek.exe");
        assert!(targets(r"C:\Tools\ember-peek.exe", exe));
        // Without quotes there is no way to tell a path from a path plus arguments, so a
        // command line with arguments does not silently count as this executable.
        assert!(!targets(r"C:\Tools\ember-peek.exe --hidden", exe));
    }

    #[test]
    fn a_string_survives_the_round_trip_through_registry_bytes() {
        for text in [
            "",
            r#""C:\Program Files\Ember Peek\ember-peek.exe""#,
            "Ember Peek",
        ] {
            assert_eq!(decode(&encode(text)), text);
        }
        // The value is null-terminated, and a shorter read stops at the terminator.
        assert_eq!(decode(&[b'A', 0, b'\0', 0, b'B', 0]), "A");
    }

    /// The one check that has to touch the real registry: it proves the key path, the access
    /// mask and the read path work on this machine. Run it explicitly with
    /// `cargo test -p ember-peek --bin ember-peek -- --ignored`.
    #[test]
    #[ignore = "reads the current user's real Run key"]
    #[cfg(windows)]
    fn the_real_run_key_can_be_read() {
        // Absent is the normal answer on a machine that never turned the setting on, so the
        // assertion is that the read succeeds — and keeps succeeding — not what it finds.
        let name = "Ember Peek (autostart test)";
        let first = registry::read(name).expect("the Run key is readable");
        let second = registry::read(name).expect("the Run key is readable again");
        assert_eq!(first, second);
    }

    /// The write path, also against the real registry. It uses a name of its own and a path
    /// that does not exist, so a run killed before it cleans up leaves an entry that starts
    /// nothing — and cannot make this app start twice.
    #[test]
    #[ignore = "writes to the current user's real Run key"]
    #[cfg(windows)]
    fn the_real_run_key_round_trips() {
        let name = "Ember Peek (autostart test)";
        let command = r#""C:\nope\ember-peek.exe""#;
        registry::remove(name).expect("a stale test entry can be removed");
        assert_eq!(registry::read(name).expect("read"), None);

        registry::write(name, command).expect("the entry is written");
        assert_eq!(
            registry::read(name).expect("read").as_deref(),
            Some(command),
            "what was written is what is stored"
        );

        registry::remove(name).expect("the entry is removed");
        assert_eq!(registry::read(name).expect("read"), None);
    }
}
