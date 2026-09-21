//! API secrets are never persisted in workshop JSON or returned to a tool page.
#[cfg(windows)]
mod platform {
    use std::{ffi::c_void, ptr};
    #[repr(C)]
    struct Credential {
        flags: u32,
        kind: u32,
        target: *mut u16,
        comment: *mut u16,
        written: [u32; 2],
        size: u32,
        blob: *mut u8,
        persist: u32,
        count: u32,
        attributes: *mut c_void,
        alias: *mut u16,
        user: *mut u16,
    }
    #[link(name = "Advapi32")]
    extern "system" {
        fn CredWriteW(credential: *const Credential, flags: u32) -> i32;
        fn CredReadW(
            target: *const u16,
            kind: u32,
            flags: u32,
            credential: *mut *mut Credential,
        ) -> i32;
        fn CredFree(buffer: *mut c_void);
        fn CredDeleteW(target: *const u16, kind: u32, flags: u32) -> i32;
    }
    fn target(scope: &str) -> Vec<u16> {
        use sha2::{Digest, Sha256};
        format!("EmberPeek/Workshop/{:x}", Sha256::digest(scope.as_bytes()))
            .encode_utf16()
            .chain(Some(0))
            .collect()
    }
    pub fn save(scope: &str, value: &str) -> Result<(), String> {
        if value.len() > 2500 {
            return Err("API key is too long".into());
        }
        let mut target = target(scope);
        let credential = Credential {
            flags: 0,
            kind: 1,
            target: target.as_mut_ptr(),
            comment: ptr::null_mut(),
            written: [0; 2],
            size: value.len() as u32,
            blob: value.as_ptr() as *mut u8,
            persist: 2,
            count: 0,
            attributes: ptr::null_mut(),
            alias: ptr::null_mut(),
            user: ptr::null_mut(),
        };
        if unsafe { CredWriteW(&credential, 0) } == 0 {
            return Err(std::io::Error::last_os_error().to_string());
        }
        Ok(())
    }
    pub fn read(scope: &str) -> Result<String, String> {
        let mut credential = ptr::null_mut();
        if unsafe { CredReadW(target(scope).as_ptr(), 1, 0, &mut credential) } == 0 {
            return Err("Configure an API key for this endpoint / 请为此 API 地址配置密钥".into());
        }
        let value = unsafe {
            if (*credential).size == 0 {
                Ok(String::new())
            } else {
                String::from_utf8(
                    std::slice::from_raw_parts((*credential).blob, (*credential).size as usize)
                        .to_vec(),
                )
            }
        };
        unsafe {
            CredFree(credential.cast());
        }
        value.map_err(|e| e.to_string())
    }
    pub fn remove(scope: &str) -> Result<(), String> {
        if unsafe { CredDeleteW(target(scope).as_ptr(), 1, 0) } == 0 {
            let error = std::io::Error::last_os_error();
            if error.raw_os_error() != Some(1168) {
                return Err(error.to_string());
            }
        }
        Ok(())
    }
}
#[cfg(not(windows))]
mod platform {
    pub fn remove(_: &str) -> Result<(), String> {
        Ok(())
    }
    pub fn save(_: &str, _: &str) -> Result<(), String> {
        Err("Credential storage requires Windows".into())
    }
    pub fn read(_: &str) -> Result<String, String> {
        Err("Credential storage requires Windows".into())
    }
}
pub use platform::{read, remove, save};
