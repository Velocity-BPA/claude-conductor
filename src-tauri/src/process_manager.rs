use anyhow::{anyhow, Result};
use chrono::Utc;
use std::collections::HashMap;
use std::path::PathBuf;
use std::process::Command;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

use crate::app_detector::build_launch_command;
use crate::models::RunningInstance;

// ─── Instance Registry ────────────────────────────────────────────────────────

pub struct InstanceRegistry {
    inner: Arc<Mutex<HashMap<u32, RunningInstance>>>,
    /// Throttle: only run prune_dead every 5 seconds, not on every poll.
    last_prune: Arc<Mutex<Instant>>,
}

impl InstanceRegistry {
    pub fn new() -> Self {
        // Set last_prune far in the past so first list() call triggers a prune.
        let past = Instant::now()
            .checked_sub(Duration::from_secs(60))
            .unwrap_or_else(Instant::now);
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            last_prune: Arc::new(Mutex::new(past)),
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
        // Only prune every 5 seconds — sysinfo full-process scans are expensive.
        let should_prune = {
            let last = self.last_prune.lock().unwrap();
            last.elapsed() > Duration::from_secs(5)
        };
        if should_prune {
            self.prune_dead();
            *self.last_prune.lock().unwrap() = Instant::now();
        }
        let map = self.inner.lock().unwrap();
        map.values().cloned().collect()
    }

    pub fn running_profile_ids(&self) -> Vec<String> {
        // Bypass throttle for tray menu — reads stale data, no prune needed.
        let map = self.inner.lock().unwrap();
        map.values().map(|i| i.profile_id.clone()).collect()
    }

    pub fn get_by_pid(&self, pid: u32) -> Option<RunningInstance> {
        let map = self.inner.lock().unwrap();
        map.get(&pid).cloned()
    }

    fn prune_dead(&self) {
        let mut map = self.inner.lock().unwrap();
        map.retain(|&pid, instance| {
            // Sentinel entries represent launches where PID detection timed out.
            if pid == 1 {
                // If we have a user_data_dir, check if Claude is still alive for it.
                if !instance.user_data_dir.is_empty() {
                    return is_profile_alive(&instance.user_data_dir);
                }
                return true;
            }
            // For real PIDs: check if the profile's Claude instance is still alive.
            // We use pgrep rather than sysinfo — faster and more reliable on macOS.
            if !instance.user_data_dir.is_empty() {
                return is_profile_alive(&instance.user_data_dir);
            }
            // No user_data_dir (shouldn't happen for normal entries) — check PID directly.
            is_pid_alive(pid)
        });
    }
}

// ─── macOS process helpers ────────────────────────────────────────────────────

/// Returns true if any process matching user_data_dir is still running.
/// Uses pgrep which is fast and reliable on macOS.
fn is_profile_alive(user_data_dir: &str) -> bool {
    if user_data_dir.is_empty() {
        return false;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("pgrep")
            .args(["-f", user_data_dir])
            .output()
            .map(|o| !o.stdout.is_empty())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        use sysinfo::{Pid, System};
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
        sys.processes().values().any(|p| {
            p.cmd()
                .iter()
                .any(|a| a.to_string_lossy().contains(user_data_dir))
        })
    }
}

/// Fallback: check if a specific PID is alive.
fn is_pid_alive(pid: u32) -> bool {
    #[cfg(target_os = "macos")]
    {
        Command::new("kill")
            .args(["-0", &pid.to_string()])
            .output()
            .map(|o| o.status.success())
            .unwrap_or(false)
    }
    #[cfg(not(target_os = "macos"))]
    {
        use sysinfo::{Pid, System};
        let mut sys = System::new();
        sys.refresh_processes(sysinfo::ProcessesToUpdate::All);
        sys.process(Pid::from_u32(pid)).is_some()
    }
}

/// Find the main Electron process PID for a given user_data_dir using pgrep + ps.
///
/// Electron helper processes (GPU, renderer, crashpad, utility) all include
/// `--type=<something>` in their args. The main browser process does not.
/// We use pgrep to get candidate PIDs and ps to inspect each one's args.
#[cfg(target_os = "macos")]
fn find_main_claude_pid(user_data_dir: &str) -> Option<u32> {
    let output = Command::new("pgrep")
        .args(["-f", user_data_dir])
        .output()
        .ok()?;

    if output.stdout.is_empty() {
        return None;
    }

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut fallback: Option<u32> = None;

    for pid_str in stdout.split_whitespace() {
        let pid: u32 = match pid_str.trim().parse() {
            Ok(p) => p,
            Err(_) => continue,
        };

        // Use `ps` to inspect this PID's full command line
        if let Ok(ps_out) = Command::new("ps")
            .args(["-p", pid_str.trim(), "-o", "args="])
            .output()
        {
            let args = String::from_utf8_lossy(&ps_out.stdout);
            if args.contains(user_data_dir) {
                if !args.contains("--type=") {
                    // This is the main browser process — prefer it
                    return Some(pid);
                }
                // Helper process — keep as fallback
                fallback = Some(pid);
            }
        }
    }

    fallback
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

        // Register immediately with sentinel PID so the UI updates right away.
        // We'll find the real PID below and re-register with the correct value.
        let sentinel = RunningInstance {
            profile_id: profile_id.to_string(),
            pid: 1,
            launched_at: Utc::now(),
            user_data_dir: ud_str.clone(),
        };
        registry.register(sentinel);

        // Try to find the real main-process PID — 4 attempts × 500ms = 2s max.
        // pgrep+ps is faster than sysinfo so 2s is sufficient in practice.
        let real_pid = find_claude_pid_with_retry(&ud_str, 4, 500);

        if let Some(pid) = real_pid {
            log::info!("Found Claude main process PID {} for profile {}", pid, profile_id);
            // Remove sentinel and register real PID
            registry.unregister(1);
            let instance = RunningInstance {
                profile_id: profile_id.to_string(),
                pid,
                launched_at: Utc::now(),
                user_data_dir: ud_str,
            };
            registry.register(instance);
            Ok(pid)
        } else {
            log::warn!(
                "Claude launched but PID not found for userdata dir {}. Keeping sentinel.",
                user_data_dir.display()
            );
            Ok(1)
        }
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
    let user_data_dir = registry
        .get_by_pid(pid)
        .map(|i| i.user_data_dir)
        .unwrap_or_default();

    registry.unregister(pid);

    #[cfg(target_os = "macos")]
    {
        if !user_data_dir.is_empty() {
            let pgrep = Command::new("pgrep")
                .args(["-f", &user_data_dir])
                .output();

            match pgrep {
                Ok(output) => {
                    let stdout = String::from_utf8_lossy(&output.stdout);
                    let pids: Vec<&str> = stdout.split_whitespace().collect();
                    log::info!(
                        "pgrep found {} processes for userdata dir: {:?}",
                        pids.len(),
                        pids
                    );
                    for p in &pids {
                        let _ = Command::new("kill").args(["-9", p]).output();
                    }
                    if pids.is_empty() {
                        log::warn!(
                            "pgrep found no processes for '{}', falling back to direct kill",
                            user_data_dir
                        );
                        let _ = Command::new("kill")
                            .args(["-9", &pid.to_string()])
                            .output();
                    }
                }
                Err(e) => {
                    log::warn!("pgrep failed: {}, falling back to direct kill", e);
                    let _ = Command::new("kill")
                        .args(["-9", &pid.to_string()])
                        .output();
                }
            }
        } else {
            log::info!("No user_data_dir for PID {}, killing directly", pid);
            let _ = Command::new("kill")
                .args(["-9", &pid.to_string()])
                .output();
        }

        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    {
        use sysinfo::{Pid, System};
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
        log::warn!(
            "Window focus not yet implemented on this platform (PID {})",
            pid
        );
        Ok(())
    }
}

// ─── PID retry helper (macOS) ─────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn find_claude_pid_with_retry(user_data_dir: &str, attempts: u32, delay_ms: u64) -> Option<u32> {
    for attempt in 0..attempts {
        if attempt > 0 {
            std::thread::sleep(Duration::from_millis(delay_ms));
        }
        if let Some(pid) = find_main_claude_pid(user_data_dir) {
            return Some(pid);
        }
        log::debug!(
            "PID search attempt {}/{} for {} — not found yet",
            attempt + 1,
            attempts,
            user_data_dir
        );
    }
    None
}
