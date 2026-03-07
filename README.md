# Claude Conductor 🎼

> Multi-profile launcher and manager for Claude Desktop

Claude Conductor gives you a menu bar UI to create, launch, and manage multiple isolated Claude Desktop instances — each with its own MCP server configuration.

## What it does

- **Profile Manager** — Create named profiles with custom MCP server configs. Each profile stores its own `claude_desktop_config.json`.
- **One-click Launch** — Launch any profile as an isolated Claude Desktop instance directly from the menu bar or main window.
- **Simultaneous Instances** — Run multiple Claude Desktop instances at the same time with no conflicts. Works by passing `--user-data-dir` to each Electron instance.
- **Instance Monitor** — See which profiles are running, their PIDs, uptime, and kill or focus them.
- **Profile Import/Export** — Share profile configs between machines or team members.

## How isolation works

Each profile gets its own directory under `~/Library/Application Support/ClaudeConductor/profiles/{id}/userdata/`. Claude Conductor writes a `claude_desktop_config.json` into that directory before launching, then invokes:

```bash
open -n -a /Applications/Claude.app \
  --args --user-data-dir="$HOME/Library/Application Support/ClaudeConductor/profiles/{id}/userdata"
```

The `-n` flag bypasses macOS's single-instance enforcement. The `--user-data-dir` flag gives each instance its own Electron lock, session storage, and config directory. Two instances never interfere.

## Installation

### Prerequisites

- macOS 12+ (primary target; Windows in progress)
- [Rust](https://rustup.rs/) 1.77+
- [Node.js](https://nodejs.org/) 18+
- Claude Desktop installed at `/Applications/Claude.app`

### Development

```bash
git clone https://github.com/Velocity-BPA/claude-conductor
cd claude-conductor
npm install
npm run tauri:dev
```

### Build

```bash
npm run tauri:build
# DMG output in: src-tauri/target/release/bundle/dmg/
```

## Data directory

All profile data is stored in:

| Platform | Path |
|----------|------|
| macOS    | `~/Library/Application Support/ClaudeConductor/` |
| Windows  | `%APPDATA%\ClaudeConductor\` |

Structure:
```
ClaudeConductor/
├── conductor.json          # App settings
└── profiles/
    ├── index.json          # Fast-access profile index (for tray menu)
    └── {profile-id}/
        ├── profile.json    # Profile definition + MCP server config
        └── userdata/
            └── claude_desktop_config.json  # Written at launch time
```

## Tech stack

- **[Tauri 2.0](https://tauri.app/)** — Rust backend + native WebView frontend (5 MB bundle vs 85 MB Electron)
- **React 18 + TypeScript** — UI layer
- **Zustand** — State management
- **Tailwind CSS** — Styling

## License

MIT — see [LICENSE](LICENSE)

## Credits

Inspired by [weidwonder/claude-desktop-multi-instance](https://github.com/weidwonder/claude-desktop-multi-instance), which proved the `--user-data-dir` isolation technique works.

Built by [Velocity BPA](https://github.com/Velocity-BPA).
