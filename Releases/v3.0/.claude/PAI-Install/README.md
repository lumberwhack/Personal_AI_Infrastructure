# PAI Installer v3.0

> Install [PAI (Personal AI Infrastructure)](https://github.com/danielmiessler/PAI) with a single command.

## Quick Start

```bash
bash PAI-Install/install.sh
```

That's it. The script handles everything:

1. Detects your operating system and installed tools
2. Installs **Bun** and **Git** if missing
3. Launches a guided installer (GUI on desktop, CLI in headless terminals)
4. Walks you through identity, voice, and configuration
5. Validates the installation before finishing

### Requirements

- **bash** and **curl** — that's all you need to start
- macOS or Linux
- Internet connection

Everything else (Bun, Git, Claude Code) is installed automatically.

---

## Installation Steps

The installer runs 8 steps in dependency order:

| # | Step | What It Does |
|---|------|-------------|
| 1 | **System Detection** | Detects OS, architecture, shell, installed tools (Bun, Git, Claude Code), timezone, and any existing PAI installation |
| 2 | **Prerequisites** | Installs missing tools: Git via Xcode CLT or package manager, Bun via official installer, Claude Code via npm |
| 3 | **API Keys** | Auto-completes — key collection happens during the Voice step |
| 4 | **Identity** | Prompts for your name, AI assistant name, timezone, and a personal catchphrase |
| 5 | **PAI Repository** | Clones the PAI repo to `~/.claude/` (or updates if already present) |
| 6 | **Configuration** | Generates `settings.json`, `.env`, directory structure, `pai` shell alias, and patches version files |
| 7 | **DA Voice** | Collects ElevenLabs API key, selects voice type (Female/Male/Custom), installs and tests voice server |
| 8 | **Validation** | Verifies directory structure, settings file, API keys, voice server, shell alias — reports pass/fail for each |

### Voice Setup

The voice step handles the complete Digital Assistant voice configuration:

1. Collects or auto-discovers your ElevenLabs API key (checks `~/.config/PAI/.env`)
2. Validates the key against the ElevenLabs API
3. Presents voice selection: **Female** (Rachel), **Male** (Adam), or **Custom Voice ID**
4. Includes audio previews so you can hear each voice before choosing
5. Installs the Qwen3 voice server as a LaunchAgent (auto-starts on login)
6. Tests TTS with a personalized greeting using your name and AI name

Voice is optional — skip the ElevenLabs key and the installer continues without voice features.

### Graceful Degradation

The installer is designed to recover from partial failures:

- No ElevenLabs key → voice features skipped, everything else works
- No existing PAI → fresh install (vs. upgrade if detected)
- Voice server install fails → configuration saved, TTS test skipped
- Claude Code not installed → attempts installation, continues if it fails
- Port conflicts → configurable via `PAI_INSTALL_PORT` environment variable

---

## Architecture

### Two-Layer Design

1. **Bootstrap** (`install.sh`) — Pure bash. Only needs bash + curl. Installs Bun and Git, then hands off to the TypeScript installer.
2. **Engine + UI** (`engine/` + `web/` + `public/`) — TypeScript (Bun). All install logic, web server, and frontend.

### Launch Modes

The installer supports three modes via `main.ts`:

| Mode | Command | Description |
|------|---------|-------------|
| **GUI** | `--mode gui` | Launches Electron window wrapping the web server. Audio autoplay works. |
| **Web** | `--mode web` | Starts the Bun HTTP/WebSocket server on port 1337. Open in any browser. |
| **CLI** | `--mode cli` | Terminal-only wizard with ANSI colors and progress bars. No browser needed. |

`install.sh` auto-selects mode: GUI when a display is available, CLI in headless/terminal-only environments. You can always override with `--mode`.

GUI mode auto-installs Electron dependencies on first run and clears macOS quarantine flags. If GUI launch fails, the installer falls back to CLI (interactive terminals) or Web mode (non-interactive sessions).

### Directory Structure

```
PAI-Install/
├── install.sh              # Bash bootstrap entry point
├── main.ts                 # Mode router (gui/web/cli)
├── generate-welcome.ts     # Welcome audio generator (build-time)
│
├── engine/                 # Core install logic (shared across all modes)
│   ├── types.ts            # TypeScript interfaces (InstallState, messages, events)
│   ├── detect.ts           # System detection (OS, tools, existing install)
│   ├── steps.ts            # Step definitions + dependency graph
│   ├── actions.ts          # Install action functions (clone, configure, voice, etc.)
│   ├── config-gen.ts       # Fallback settings.json generator
│   ├── validate.ts         # Post-install validation checks
│   ├── state.ts            # State persistence (resume interrupted installs)
│   └── index.ts            # Re-exports
│
├── web/                    # Web server (GUI and Web modes)
│   ├── server.ts           # Bun HTTP + WebSocket server (port 1337)
│   └── routes.ts           # WebSocket message handler + install orchestrator
│
├── cli/                    # CLI frontend
│   ├── index.ts            # CLI entry point
│   └── display.ts          # ANSI colors, progress bars, banners
│
├── public/                 # Static web assets
│   ├── index.html          # Single-page application shell
│   ├── styles.css          # Dark theme with glassmorphic effects
│   ├── app.js              # Frontend JavaScript (WebSocket client, UI rendering)
│   └── assets/             # Logos, fonts, welcome audio, voice previews
│
├── electron/               # Electron native wrapper
│   ├── main.js             # Spawns Bun server + opens BrowserWindow
│   └── package.json        # Electron dependency
│
└── README.md               # This file
```

---

## WebSocket Protocol

The Web UI communicates with the install engine over WebSocket. The server runs on `ws://localhost:1337/ws`.

### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `client_ready` | — | Client connected and ready |
| `start_install` | — | User clicked "Begin Installation" |
| `user_input` | `{ requestId, value }` | Response to a text/password input prompt |
| `user_choice` | `{ requestId, value }` | Response to a multiple-choice prompt |

### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `connected` | — | Connection acknowledged |
| `step_update` | `{ step, status }` | Step status changed (pending/active/completed/skipped/failed) |
| `detection_result` | `{ data }` | System detection results (OS, tools, existing install) |
| `message` | `{ role, content, speak? }` | Chat message (assistant/system/error) |
| `input_request` | `{ id, prompt, inputType, placeholder }` | Request text/password input from user |
| `choice_request` | `{ id, prompt, choices[] }` | Request selection from options |
| `progress` | `{ step, percent, detail }` | Progress bar update for long operations |
| `validation_result` | `{ checks[] }` | Array of validation check results |
| `install_complete` | `{ summary }` | Installation finished with summary data |
| `error` | `{ message }` | Error message |

Messages include a `replayed` flag for reconnect replay — replayed messages skip animations and TTS.

### Message Flow Example

```
Client                          Server
  │                               │
  ├── client_ready ──────────────→│
  │←─────────────── connected ────┤
  │                               │
  ├── start_install ─────────────→│
  │←──────────── step_update ─────┤  (system-detect → active)
  │←──────── detection_result ────┤  (OS, tools, etc.)
  │←──────────── step_update ─────┤  (system-detect → completed)
  │                               │
  │←──────── input_request ───────┤  ("What is your name?")
  ├── user_input ────────────────→│
  │←──────────── message ─────────┤  ("Welcome, Daniel!")
  │                               │
  │←──────── choice_request ──────┤  ("Select voice type")
  ├── user_choice ───────────────→│
  │←──────────── progress ────────┤  (voice server install: 40%)
  │←──────────── step_update ─────┤  (voice → completed)
  │                               │
  │←──── validation_result ───────┤  (all checks)
  │←──── install_complete ────────┤  (summary card)
```

---

## Configuration

### Settings Merge Strategy

PAI ships a complete `settings.json` template in the release repository. This template includes:

- **Hooks** — 20+ event hooks for session management, security, voice, etc.
- **Status line** — Terminal status bar configuration
- **Spinner verbs** — Activity indicator messages
- **Context files** — Files loaded into Claude Code context

The installer **does NOT generate hooks or status line config**. Instead, it:

1. Clones the PAI repository (which includes the full `settings.json` template)
2. Merges only user-specific fields into the existing template:
   - `principal` — user name, timezone
   - `daidentity` — AI name, voice ID, personality
   - `env` — PAI_DIR, PROJECTS_DIR
   - `pai` — version info
3. Preserves all hooks, status line, spinner verbs, and context files from the template

This ensures fresh installs get the full PAI configuration without the installer needing to know about every hook.

### Generated Files

| File | Location | Contents |
|------|----------|----------|
| `settings.json` | `~/.claude/settings.json` | Merged config (template + user fields) |
| `.env` | `~/.config/PAI/.env` | `ELEVENLABS_API_KEY=...` |
| `LATEST` | `~/.claude/skills/PAI/Components/Algorithm/LATEST` | Algorithm version (patched to current) |
| Shell alias | `~/.zshrc` | `alias pai='cd ~/.claude && claude'` |

### Directory Structure Created

```
~/.claude/
├── settings.json
├── hooks/
├── skills/
├── MEMORY/
│   ├── WORK/
│   ├── STATE/
│   ├── LEARNING/
│   └── VOICE/
├── Plans/
└── Projects/
```

### Banner and Counts

On first launch after installation, the PAI banner displays system statistics (skills, hooks, workflows, signals, files). These counts are:

1. **Calculated by the installer** during the Configuration step (initial values)
2. **Updated by the StopOrchestrator hook** at the end of each Claude Code session

The Algorithm version displayed in the banner reads from `skills/PAI/Components/Algorithm/LATEST`.

---

## Web UI Features

- **Electron wrapper** — Opens in a controlled 1280x820 window with audio autoplay enabled
- **Dark theme** — Deep navy/black with PAI blue accents and glassmorphic card effects
- **Step sidebar** — All 8 steps with live status indicators (pending/active/completed/skipped/failed)
- **Progress bar** — Header shows overall completion percentage
- **Voice previews** — Listen to Female/Male voice samples before selecting
- **Welcome audio** — Pre-recorded MP3 plays on launch
- **Auto-reconnect** — WebSocket reconnects on disconnect with 2-second retry and full message replay
- **Input masking** — API keys are masked in the chat display (shows first 8 chars only)
- **Choice buttons** — Styled selection cards with descriptions and optional audio previews

---

## Post-Installation

After the installer completes, open a terminal and run:

```bash
source ~/.zshrc && pai
```

This reloads your shell config (activates the `pai` alias) and launches PAI for the first time.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `bun: command not found` | Run `curl -fsSL https://bun.sh/install \| bash` then restart terminal |
| Port 1337 in use | Set `PAI_INSTALL_PORT=8080` before running install.sh |
| ElevenLabs key invalid | Verify at elevenlabs.io — ensure no trailing spaces, key starts with `xi-` or `sk_` |
| Permission denied | Run `chmod -R 755 ~/.claude` |
| `pai` command not found | Run `source ~/.zshrc` to reload shell config |
| Voice server won't start | Check port 8888 is free: `lsof -ti:8888`. Kill any process using it. |
| Banner shows wrong algorithm version | Check `~/.claude/skills/PAI/Components/Algorithm/LATEST` contains correct version |
| Banner counts all show 0 | Normal on first launch — counts populate after your first Claude Code session ends |
| WebSocket "Connection lost" | The installer auto-reconnects. If persistent, check if another process is using port 1337 |
| Electron window blank | Try `--mode web` instead and open `http://localhost:1337` in your browser |

### Recovery

The installer saves state to disk. If interrupted, re-run `install.sh` — it will detect the existing installation and offer to resume or start fresh.

---

## Development

### Running Locally

```bash
# Web mode (development)
bun run PAI-Install/main.ts --mode web

# CLI mode
bun run PAI-Install/main.ts --mode cli

# GUI mode (Electron — installs deps on first run)
bun run PAI-Install/main.ts --mode gui
```

### Key Design Decisions

- **No framework dependencies** — Frontend is vanilla JavaScript. No React, no build step.
- **Bun-native server** — Uses `Bun.serve()` for HTTP and WebSocket in one process.
- **Async voice server management** — Voice server install/start uses async `spawn` (not `execSync`) to avoid blocking the event loop and killing WebSocket connections.
- **Safe process cleanup** — Port cleanup uses `lsof -sTCP:LISTEN` to kill only the listening process, not client connections.
- **Template-based settings** — Installer merges user fields into the release template rather than generating a complete settings.json from scratch.

---

## Known Limitations

- **macOS and Linux only** — Windows is not supported
- **Internet connection required** — Downloads tools, clones repository, validates API keys
- **Voice requires ElevenLabs** — Voice synthesis is optional but needs an ElevenLabs API key
- **Single-user** — Installs to `~/.claude/` for the current user only
- **Electron optional** — If GUI dependencies fail, installer falls back automatically (CLI on interactive terminals, Web on non-interactive sessions)

## License

Part of [PAI — Personal AI Infrastructure](https://github.com/danielmiessler/PAI).
