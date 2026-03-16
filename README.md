# Claude Conductor

A desktop utility for running multiple isolated [Claude Desktop](https://claude.ai/download) instances simultaneously, each with its own MCP server configuration and user profile.

![Claude Conductor](src-tauri/icons/128x128.png)

---

## Why Claude Conductor?

Claude Desktop supports one active configuration at a time. If you work across multiple contexts — different MCP servers for different clients, projects, or roles — switching between them means manually editing `claude_desktop_config.json` and restarting the app each time.

Claude Conductor solves this with named **profiles**. Each profile has its own MCP server setup and launches as a fully isolated Claude Desktop instance. All instances run simultaneously with no shared state.

---

## 💡 Launch All Claude Instances from Conductor

**For the best experience, use Claude Conductor as the single launcher for all your Claude Desktop instances — including your personal day-to-day one.**

Here's why this matters:

Claude Conductor tracks instances it launches. It stores the process ID and isolated user data directory for each one, which is what powers the **running** status indicator, the **Focus** button, and the **Kill** button.

If you launch Claude Desktop manually (by clicking it in your Dock or Applications folder) before opening Conductor, that instance runs outside Conductor's registry. Conductor has no knowledge of it — it won't appear as running, you can't Focus or Kill it from Conductor, and it won't count toward the running instance total in the tray.

**The recommended workflow:**

1. Create a profile called **"Personal"** (or whatever fits) that mirrors your everyday Claude Desktop setup
2. Click **⬇ Import from Claude Desktop** to pull in your existing MCP servers in one click
3. From that point on, launch everything — personal and work instances — from Conductor
4. Quit Claude Desktop from your Dock if it's currently running, and relaunch it via Conductor

Once everything is launched through Conductor, you get full lifecycle control over every instance from one place.

> **Note:** Conductor startup detection for already-running instances (launched outside of Conductor) is on the roadmap. For now, the cleanest experience comes from using Conductor as your sole launcher.

---

## Features

- **Multiple isolated instances** — each profile runs Claude Desktop with its own user data directory and MCP config
- **Profile management** — create, edit, duplicate, import, and export profiles
- **Drag to reorder** — drag profiles into any order; persisted across restarts
- **Search / filter** — filter profiles by name or description; appears automatically when you have more than 3 profiles
- **One-click import** — reads your existing `claude_desktop_config.json` and imports all servers into a new profile
- **Keychain integration** — sensitive env vars (API keys, tokens) stored in the macOS Keychain, never written to disk in plaintext
- **Live instance monitoring** — see which profiles are running with real-time status
- **Focus & Kill** — bring any running instance to the front, or terminate it (kills the full Electron process tree via `pgrep`)
- **Confirm before kill** — optional native OS confirmation dialog
- **Double-launch guard** — Launch button disabled for already-running profiles
- **Launch at login** — registers a macOS LaunchAgent so Conductor starts automatically at login
- **System tray** — lives in the menu bar with a live running instance count

---

## Requirements

- macOS 12+ (primary platform; Windows/Linux builds are possible but untested)
- [Claude Desktop](https://claude.ai/download) installed at `/Applications/Claude.app`
- Node.js 18+
- Rust (stable toolchain) — install via [rustup.rs](https://rustup.rs)
- Python 3 + Pillow (for icon generation — see below)

---

## ⚠️ Before You Build: Generate Icons

**This step is required after every fresh clone.** The app icon files cannot be stored as valid binaries in this repository and must be generated locally before the Rust build will succeed.

If you skip this step you will see:

```
error: failed to read icon /path/to/icons/32x32.png: Invalid PNG signature.
```

**Fix — run this once after cloning:**

```sh
pip3 install Pillow
python3 scripts/generate_icons.py
```

You only need to run it again if you do a fresh clone or delete the `src-tauri/icons/` directory.

---

## Installation & Development

```sh
# 1. Clone
git clone https://github.com/Velocity-BPA/claude-conductor.git
cd claude-conductor

# 2. Install JS dependencies
npm install

# 3. Generate icons (required — see above)
pip3 install Pillow
python3 scripts/generate_icons.py

# 4. Start dev server
npm run tauri:dev
```

The app window appears after ~15–30 seconds on first run while Rust compiles dependencies.

### Build for production

```sh
npm run tauri:build
```

The built app is at:
```
src-tauri/target/release/bundle/macos/Claude Conductor.app
```

Copy to `/Applications` to install like any other Mac app:

```sh
cp -r "src-tauri/target/release/bundle/macos/Claude Conductor.app" /Applications/
```

> **First launch:** macOS will block it as unverified (app is unsigned). Run `xattr -cr "/Applications/Claude Conductor.app"` once to clear the quarantine flag, then double-click as normal.

---

## How It Works

Each profile stores a name, icon, color, and a map of MCP server configurations. When you launch a profile, Conductor:

1. Resolves any Keychain secrets into env vars (in memory only)
2. Writes `claude_desktop_config.json` to an isolated per-profile user data directory
3. Launches Claude Desktop with `--user-data-dir` pointing to that directory
4. Identifies the main Electron process PID (the process without `--type=` in its args, using `pgrep` + `ps`)
5. Registers the instance immediately so the UI updates without waiting

Killing an instance runs `pgrep -f <user_data_dir>` and sends `kill -9` to every matching PID, reliably terminating the full Electron process tree.

---

## Profile Storage

| Data | Location |
|---|---|
| Profile configs | `~/Library/Application Support/ClaudeConductor/profiles/<id>/profile.json` |
| Isolated user data | `~/Library/Application Support/ClaudeConductor/userdata/<profile_id>/` |
| MCP secrets | macOS Keychain (service: `claude-conductor`) |
| App settings | `~/Library/Application Support/ClaudeConductor/settings.json` |

---

## MCP Server Secrets

Any env var can be marked as a secret (🔒). Marked values are stored in the **macOS Keychain** rather than in the profile JSON. The profile stores an empty string placeholder.

On launch, secrets are resolved from the Keychain into memory — they are never written to disk in plaintext.

> Secrets are scoped by profile ID. Duplicating a profile does not copy its Keychain secrets — re-mark and save the duplicate to create new entries.

---

## Settings

| Setting | Description |
|---|---|
| Launch at login | Registers a macOS LaunchAgent; Conductor starts automatically at login |
| Confirm before kill | Shows a native confirmation dialog before killing an instance |
| Claude Desktop path | Override auto-detected path to Claude.app |

---

## Known Limitations

- **Icons must be generated locally** after every fresh clone (`python3 scripts/generate_icons.py`)
- **Instances launched outside Conductor are not tracked** — launch everything through Conductor for full lifecycle control (startup detection is on the roadmap)
- **PID tracking is best-effort** — if Claude Desktop is not detected within ~2 seconds, a sentinel is used; the entry self-corrects on the next prune cycle
- **Keychain secrets not stored on profile create** — secrets are written to the Keychain on the first save/edit after creation
- **macOS only (primary)** — kill (`pgrep`) and focus (`osascript`) are macOS-specific; Windows/Linux builds compile but instance management is limited

---

## Changelog

### v1.0.3
- **Fixed:** Multi-instance status definitively resolved — replaced all `sysinfo` usage on macOS with `pgrep` + `ps` for reliable alive checks
- **Fixed:** Profile cards now update to "running" immediately on launch (sentinel registered instantly; real PID resolved in background)
- **Improved:** `prune_dead()` throttled to run at most once every 5 seconds instead of on every 3-second UI poll, eliminating redundant process scans
- **Fixed:** `tauri.conf.json` version synced to match `package.json` and `Cargo.toml`

### v1.0.2
- **Fixed:** Compile error in `find_main_pid_for_userdata` — `.values()` → `.iter()` to correctly yield `(&Pid, &Process)` tuples

### v1.0.1
- **Fixed:** TypeScript build error — unused `deleteProfile` import in `ProfileModal`

### v1.0.0
- Initial stable release — multi-instance launch, Keychain secrets, one-click import, drag-to-reorder, search/filter, duplicate profiles, Focus & Kill, launch at login, system tray

---

## License

MIT — built by [Velocity BPA](https://github.com/Velocity-BPA)
