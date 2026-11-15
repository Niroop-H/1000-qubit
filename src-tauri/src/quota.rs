//! Desktop execution UX quota: 20 shared launches, then a five-hour cooldown.
//! Persistent across normal restarts/uninstalls until the per-user app-data record
//! is removed. This is NOT a cryptographically secure commercial license gate.
use serde::{Deserialize, Serialize};
use std::{
    fs,
    io::ErrorKind,
    path::Path,
    sync::Mutex,
    time::{SystemTime, UNIX_EPOCH},
};
use tauri::{AppHandle, Manager, State};

const LIMIT: u8 = 20;
const COOLDOWN_MS: u64 = 5 * 60 * 60 * 1000;
const SCHEMA: &str = "D25-Desktop-Quota/v1";
const RECORD: &str = "execution_quota_v1.json";

#[derive(Default)]
pub struct QuotaStore {
    lock: Mutex<()>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Ledger {
    version: u8,
    remaining: u8,
    cooldown_until: u64,
    last_seen_ms: u64,
}

impl Default for Ledger {
    fn default() -> Self {
        Self { version: 1, remaining: LIMIT, cooldown_until: 0, last_seen_ms: 0 }
    }
}

impl Ledger {
    fn validate(&self) -> Result<(), String> {
        if self.version != 1
            || self.remaining > LIMIT
            || (self.remaining == 0) != (self.cooldown_until != 0)
        {
            return Err("Invalid desktop execution allowance record.".into());
        }
        Ok(())
    }

    fn apply(&mut self, now: u64, spend: bool) -> bool {
        // Remember the latest recorded clock to prevent backward clock adjustments
        // from immediately shortening a cooldown. Offline tampering is still possible.
        let effective_now = now.max(self.last_seen_ms);
        if self.cooldown_until > 0 && effective_now >= self.cooldown_until {
            self.remaining = LIMIT;
            self.cooldown_until = 0;
        }
        if !spend {
            return self.remaining > 0;
        }
        if self.remaining == 0 {
            return false;
        }
        self.remaining -= 1;
        self.last_seen_ms = effective_now;
        if self.remaining == 0 {
            self.cooldown_until = effective_now.saturating_add(COOLDOWN_MS);
        }
        true
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QuotaResponse {
    schema: &'static str,
    limit: u8,
    remaining: u8,
    retry_at: u64,
    allowed: bool,
}

fn read_ledger(path: &Path) -> Result<Ledger, String> {
    let ledger = match fs::read(path) {
        Ok(bytes) => {
            if bytes.len() > 1024 {
                return Err("Desktop execution allowance record is too large.".into());
            }
            serde_json::from_slice::<Ledger>(&bytes)
                .map_err(|_| "Desktop execution allowance record is unreadable.".to_string())?
        }
        Err(e) if e.kind() == ErrorKind::NotFound => Ledger::default(),
        Err(e) => return Err(format!("Cannot access desktop execution allowance: {e}")),
    };
    ledger.validate()?;
    Ok(ledger)
}

fn write_ledger(path: &Path, ledger: &Ledger) -> Result<(), String> {
    let temp = path.with_extension("tmp");
    let contents = serde_json::to_vec(ledger).map_err(|e| e.to_string())?;
    fs::write(&temp, contents).map_err(|e| format!("Cannot save desktop allowance: {e}"))?;
    fs::rename(&temp, path).map_err(|e| format!("Cannot commit desktop allowance: {e}"))?;
    Ok(())
}

fn quota(app: &AppHandle, store: &QuotaStore, spend: bool) -> Result<QuotaResponse, String> {
    let _guard = store.lock.lock().map_err(|_| "Desktop allowance is locked.".to_string())?;
    let directory = app.path().app_data_dir().map_err(|e| e.to_string())?;
    fs::create_dir_all(&directory).map_err(|e| format!("Cannot initialize app data: {e}"))?;
    let path = directory.join(RECORD);
    let mut ledger = read_ledger(&path)?;
    let previous = ledger.clone();
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis() as u64;
    let allowed = ledger.apply(now, spend);
    if ledger != previous {
        write_ledger(&path, &ledger)?;
    }
    Ok(QuotaResponse {
        schema: SCHEMA,
        limit: LIMIT,
        remaining: ledger.remaining,
        retry_at: ledger.cooldown_until,
        allowed,
    })
}

#[tauri::command]
pub fn d25_quota_status(app: AppHandle, store: State<'_, QuotaStore>) -> Result<QuotaResponse, String> {
    quota(&app, &store, false)
}

#[tauri::command]
pub fn d25_quota_reserve(app: AppHandle, store: State<'_, QuotaStore>) -> Result<QuotaResponse, String> {
    quota(&app, &store, true)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn twentieth_launch_is_allowed_but_next_is_blocked() {
        let mut record = Ledger::default();
        for expected in (0..LIMIT).rev() {
            assert!(record.apply(1_000, true));
            assert_eq!(record.remaining, expected);
        }
        assert_eq!(record.cooldown_until, 1_000 + COOLDOWN_MS);
        assert!(!record.apply(1_001, true));
        assert!(!record.apply(1_001, false));
        assert_eq!(record.remaining, 0);
    }

    #[test]
    fn refill_only_at_five_hour_boundary() {
        let mut record = Ledger { remaining: 0, cooldown_until: 100 + COOLDOWN_MS, last_seen_ms: 100, ..Ledger::default() };
        assert!(!record.apply(100 + COOLDOWN_MS - 1, true));
        assert!(record.apply(100 + COOLDOWN_MS, true));
        assert_eq!(record.remaining, LIMIT - 1);
        assert_eq!(record.cooldown_until, 0);
    }

    #[test]
    fn impossible_and_corrupt_counters_fail_closed() {
        let mut record = Ledger::default();
        record.remaining = 0;
        assert!(record.validate().is_err());
        record.remaining = LIMIT + 1;
        assert!(record.validate().is_err());
    }

    #[test]
    fn rollback_does_not_shortcut_active_cooldown() {
        let mut record = Ledger { remaining: 0, cooldown_until: COOLDOWN_MS + 100, last_seen_ms: 100, ..Ledger::default() };
        assert!(!record.apply(20, true));
        assert_eq!(record.cooldown_until, COOLDOWN_MS + 100);
    }
}
