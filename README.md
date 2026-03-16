# Claude Conductor

A desktop utility for running multiple isolated [Claude Desktop](https://claude.ai/download) instances simultaneously, each with its own MCP server configuration and user profile.

![Claude Conductor](src-tauri/icons/128x128.png)

---

## Why

Claude Desktop supports one active configuration at a time. If you work across multiple contexts — different sets of MCP servers for different clients, projects, or roles — switching between them means manually editing `claude_desktop_config.json` and restarting the app each time.

Claude Conductor solves this by letting you define named profiles, each with their own MCP server setup, and launch them as fully isolated Claude Desktop instances. All instances run simultaneously with no shared state.

---

## Features

- **Multiple isolated instances** — each profile runs Claude Desktop with its own user data directory and MCP config
- **Profile management** — create, edit, duplicate, import, and export profiles
- **Drag to reorder** — drag profiles into any order; persisted across restarts
- **Search / filter** — filter profiles by name or description; appears automatically once you have more than 3
- **One-click import** — reads your existing `claude_desktop_config.json` and imports all servers into a new profile
- **Keychain integration** — sensitive env vars (API keys, tokens) are stored in the macOS Keychain rather than in plain text config files
- **Live instance monitoring** — see which profiles are running, their PID, uptime, and MCP server count
- **Focus & Kill** — bring any running instance to the front or terminate it (kills the full Electron process tree via `pgrep`)
- **Confirm before kill** — optional native OS confirmation dialog before terminating an instance
- **Launch at login** — registers a macOS LaunchAgent so Conductor starts automatically at login
- **System tray** — lives in the menu bar with a live running instance count; launch or kill instances without opening the main window
- **Double-launch guard** — Launch button is disabled for profiles already running

---

## Requirements

- macOS 12+ (primary platform; Windows/Linux builds are possible but untested)
- [Claude Desktop](https://claude.ai/download) installed at `/Applications/Claude.app`
- [Node.js](https://nodejs.org) 18+
- [Rust](https://rustup.rs) (stable toolchain)
- Python 3 + Pillow (for icon generation — see below)

---

## ⚠️ Before You Build: Generate Icons

**This step is required after every fresh clone.** The app icon files (`32x32.png`, `128x128.png`, etc.) cannot be stored as valid binaries in this repository due to GitHub API limitations — they must be generated locally before the Rust build will succeed.

If you skip this step you will see this error when building:

```
error: failed to read icon /path/to/icons/32x32.png: Invalid PNG signature.
```

**Fix — run this once after cloning:**

```sh
pip3 install Pillow
python3 scripts/generate_icons.py
```

That's it. The script generates all required icon sizes from the source SVG. You only need to run it again if you delete the `src-tauri/icons/` directory or do a fresh clone.

---

## Development

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

The app window will appear after ~15–30 seconds on first run while Rust compiles dependencies.

### Build for release

```sh
npm run tauri:build
```

---

## Project Structure

```
claude-conductor/
├── src/                        # React + TypeScript frontend
│   ├── components/
│   │   ├── Titlebar.tsx        # Traffic light buttons + window drag
│   │   ├── ProfilesView.tsx    # Profile list with search + drag-to-reorder
│   │   ├── ProfileCard.tsx     # Profile card with Launch/Focus/Kill/Duplicate
│   │   ├── ProfileModal.tsx    # Create/edit modal with JSON editor + keychain UI
│   │   ├── InstanceMonitor.tsx # Running instances view
│   │   ├── SettingsView.tsx    # App settings with working toggles
│   │   └── ErrorToast.tsx      # Global error display
│   ├── stores/index.ts         # Zustand store — all state and Tauri invoke calls
│   └── types/index.ts          # Shared TypeScript types
├── src-tauri/                  # Rust backend
│   ├── src/
│   │   ├── commands.rs         # All Tauri commands (profiles, keychain, window, launch)
│   │   ├── process_manager.rs  # Launch, kill (pgrep-based), focus, PID tracking
│   │   ├── profile_store.rs    # Profile persistence (JSON files per profile)
│   │   ├── config_generator.rs # Writes claude_desktop_config.json per profile
│   │   ├── app_detector.rs     # Detects Claude Desktop path, builds launch command
│   │   ├── models.rs           # Shared data models
│   │   └── lib.rs              # App setup, tray menu, autostart plugin, event handlers
│   ├── capabilities/
│   │   └── default.json        # Tauri 2.0 capability permissions
│   ├── icons/                  # App icons (regenerated by scripts/generate_icons.py)
│   └── tauri.conf.json
└── scripts/
    └── generate_icons.py       # Generates all icon sizes using Pillow
```

---

## How It Works

Each profile stores:
- A name, icon, color, and description
- A map of MCP server configurations (command, args, env vars)
- Optional keychain-backed secrets (env var values stored in macOS Keychain, not on disk)

When you launch a profile, Conductor:
1. Resolves any keychain secrets into env vars in memory
2. Writes a `claude_desktop_config.json` to an isolated per-profile user data directory
3. Launches Claude Desktop with `--user-data-dir` pointing to that directory
4. Stores the `user_data_dir` on the running instance record for reliable kill targeting

Killing an instance runs `pgrep -f <user_data_dir>` and sends `kill -9` to every matching PID, reliably terminating the full Electron process tree (main, GPU helper, renderer, crashpad handler, etc.).

---

## Profile Storage

Profiles are stored at:

```
~/Library/Application Support/ClaudeConductor/profiles/<id>/profile.json
```

Each Claude Desktop instance gets its own user data directory at:

```
~/Library/Application Support/ClaudeConductor/userdata/<profile_id>/
```

---

## MCP Server Secrets

When editing a profile, any env var key can be marked as a secret (🔒). Marked values are stored in the **macOS Keychain** under the service name `claude-conductor` rather than in the profile JSON. The profile stores an empty string as a placeholder.

On launch, secrets are resolved from the keychain into memory just before Claude Desktop starts — they are never written to disk in plaintext.

> **Note:** Secrets are scoped by profile ID. Duplicating a profile does not copy its keychain secrets — the copy starts clean. Re-mark and save the duplicate to create new keychain entries.

---

## Settings

| Setting | Description |
|---|---|
| Launch at login | Registers a macOS LaunchAgent; Conductor starts automatically at login |
| Confirm before kill | Show a native confirmation dialog before killing an instance |
| Claude Desktop path | Override auto-detected Claude Desktop location |

---

## Known Limitations

- **Icons must be generated locally** — run `python3 scripts/generate_icons.py` after every fresh clone (see [Before You Build](#️-before-you-build-generate-icons) above)
- **PID tracking is best-effort** — if Claude Desktop's process is not detected within ~6 seconds of launch, a sentinel PID is used and the instance will auto-clear from the registry on the next poll
- **Keychain secrets not stored on profile create** — secrets are moved to the keychain on the first save/edit after creation
- **macOS only (primary)** — the kill mechanism (`pgrep`) and window focus logic (`osascript`) are macOS-specific; Windows/Linux builds compile but instance management features are limited

---

## Changelog

### v1.0.1
- Fixed TypeScript build error: removed unused `deleteProfile` import from top-level `ProfileModal` destructure (it was already correctly scoped inside `DeleteConfirmModal`)

### v1.0.0
- Initial stable release
- Multi-instance launch with isolated user data directories
- MCP secrets stored in macOS Keychain
- One-click import from existing `claude_desktop_config.json`
- Drag-to-reorder, search/filter, duplicate profiles
- Focus & Kill with full Electron process tree termination
- Launch at login, system tray, confirm-before-kill
- Built with Tauri 2.0 + React + Rust

---

## License

MIT
