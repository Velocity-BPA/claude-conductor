use anyhow::{anyhow, Result};
use chrono::Utc;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use sysinfo::{Pid, System};

use crate::app_detector::build_launch_command;
use crate::models::RunningInstance;

// ─── Instance Registry ────────────────────────────────────────────────────────

pub struct InstanceRegistry {
    inner: Arc<Mutex<HashMap<u32, RunningInstance>>>,
}

impl InstanceRegistry {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn register(&self, instance: RunningInstance) {
        let mut map = self.inner.lock().unwrap();
        map.insert(instance.pid, instance);
    }

    pub fn unregister(&self, pid: u32) {
        let mut map = self.inner.lock().unwrap();
        map.remove(&pid);
    }

    pub fn list(&self) -> Vec<RunningInstance> {
        self.prune_dead();
        let map = self.inner.lock().unwrap();
        map.values().cloned().collect()
    }

    pub fn running_profile_ids(&self) -> Vec<String> {
        self.list().iter().map(|i| i.profile_id.clone()).collect()
    }

    pub fn get_by_pid(&self, pid: u32) -> Option<RunningInstance> {
        let map = self.inner.lock().unwrap();
        map.get(&pid).cloned()
    }

    fn prune_dead(&self) {
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
        let mut map = self.inner.lock().unwrap();
        map.retain(|&pid, _| {
            // Always keep sentinel pid=1 entries — they represent untracked launches
            pid == 1 || sys.process(Pid::from_u32(pid)).is_some()
        });
    }
}

// ─── Launch ───────────────────────────────────────────────────────────────────

pub fn launch(
    claude_path: &str,
    user_data_dir: &PathBuf,
    profile_id: &str,
    registry: &InstanceRegistry,
) -> Result<u32> {
    let (program, args) = build_launch_command(claude_path, user_data_dir)?;
    let ud_str = user_data_dir.to_string_lossy().to_string();

    log::info!("Launching Claude Desktop: {} {:?}", program, args);

    #[cfg(target_os = "macos")]
    {
        let child = Command::new(&program)
            .args(&args)
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn process: {}", e))?;
        drop(child);

        // Retry PID search up to 8 times with 750ms gaps (6s total).
        let pid = find_claude_pid_with_retry(user_data_dir, 8, 750);

        let pid = match pid {
            Some(p) => {
                log::info!("Found Claude process PID {}", p);
                p
            }
            None => {
                log::warn!(
                    "Claude launched but PID not found for userdata dir {}. Using sentinel.",
                    user_data_dir.display()
                );
                1
            }
        };

        let instance = RunningInstance {
            profile_id: profile_id.to_string(),
            pid,
            launched_at: Utc::now(),
            user_data_dir: ud_str,
        };
        registry.register(instance);
        Ok(pid)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let child = Command::new(&program)
            .args(&args)
            .spawn()
            .map_err(|e| anyhow!("Failed to spawn process: {}", e))?;
        let pid = child.id();
        let instance = RunningInstance {
            profile_id: profile_id.to_string(),
            pid,
            launched_at: Utc::now(),
            user_data_dir: ud_str,
        };
        registry.register(instance);
        Ok(pid)
    }
}

// ─── Kill ─────────────────────────────────────────────────────────────────────

pub fn kill(pid: u32, registry: &InstanceRegistry) -> Result<()> {
    // Look up the stored user_data_dir for this instance
    let user_data_dir = registry
        .get_by_pid(pid)
        .map(|i| i.user_data_dir)
        .unwrap_or_default();

    registry.unregister(pid);

    #[cfg(target_os = "macos")]
    {
        if !user_data_dir.is_empty() {
            // Use pgrep to find all PIDs whose args contain the user data dir,
            // then kill -9 each one. This handles the full Electron process tree.
            let pgrep = Command::new("pgrep")
                .args(["-f", &user_data_dir])
                .output();

            match pgrep {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let pids: Vec<&str> = stdout.split_whitespace().collect();
                    log::info!("pgrep found {} processes for userdata dir: {:?}", pids.len(), pids);

                    for p in &pids {
                        let _ = Command::new("kill").args(["-9", p]).output();
                    }

                    if pids.is_empty() {
                        log::warn!("pgrep found no processes for '{}', falling back to direct kill", user_data_dir);
                        let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
                    }
                }
                Err(e) => {
                    log::warn!("pgrep failed: {}, falling back to direct kill", e);
                    let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
                }
            }
        } else {
            // No user_data_dir stored (sentinel or old entry) — kill PID directly
            log::info!("No user_data_dir for PID {}, killing directly", pid);
            let _ = Command::new("kill").args(["-9", &pid.to_string()]).output();
        }

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
        if let Some(process) = sys.process(Pid::from_u32(pid)) {
            process.kill();
            log::info!("Killed process PID {}", pid);
        }
        Ok(())
    }
}

// ─── Focus ────────────────────────────────────────────────────────────────────

pub fn focus(pid: u32) -> Result<()> {
    #[cfg(target_os = "macos")]
    {
        let script = if pid == 1 {
            r#"tell application "Claude" to activate"#.to_string()
        } else {
            format!(
                r#"tell application "System Events"
                    set frontmost of (first process whose unix id is {}) to true
                end tell"#,
                pid
            )
        };
        Command::new("osascript")
            .arg("-e")
            .arg(&script)
            .output()
            .map_err(|e| anyhow!("Failed to focus window: {}", e))?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        log::warn!("Window focus not yet implemented on this platform (PID {})", pid);
        Ok(())
    }
}

// ─── Helper: retry PID search (macOS) ────────────────────────────────────────

#[cfg(target_os = "macos")]
fn find_claude_pid_with_retry(
    user_data_dir: &PathBuf,
    attempts: u32,
    delay_ms: u64,
) -> Option<u32> {
    for attempt in 0..attempts {
        if attempt > 0 {
            std::thread::sleep(std::time::Duration::from_millis(delay_ms));
        }

        if let Some(pid) = scan_for_claude_pid(user_data_dir) {
            return Some(pid);
        }

        log::debug!(
            "PID search attempt {}/{} — not found yet",
            attempt + 1,
            attempts
        );
    }
    None
}

#[cfg(target_os = "macos")]
fn scan_for_claude_pid(user_data_dir: &PathBuf) -> Option<u32> {
    let ud_str = user_data_dir.to_string_lossy().to_string();
    let mut sys = System::new();
    sys.refresh_processes(sysinfo::ProcessesToUpdate::All);

    for (pid, process) in sys.processes() {
        let name = process.name().to_string_lossy().to_lowercase();
        if !name.contains("claude") {
            continue;
        }
        let cmd: Vec<String> = process
            .cmd()
            .iter()
            .map(|s| s.to_string_lossy().to_string())
            .collect();
        if cmd.iter().any(|arg| arg.contains(&ud_str)) {
            return Some(pid.as_u32());
        }
    }
    None
}
