# PixelForge

Assemble your AI coding team like it's a game.

PixelForge runs real coding-agent CLIs — Codex, Claude Code, OpenCode, Gemini and more —
each inside its own live terminal. Give your team a goal, watch them work, and step in
whenever they need you.

## Project structure

This repository is a monorepo. The desktop application is one part of it; more surfaces
(a web UI, and later the full team dashboard) will live alongside it.

```
apps/
  desktop/          # Electron desktop app (React + TypeScript)
    src/
      main/         # Electron main process: node-pty sessions, CLI detection, IPC
      preload/      # context-isolated bridge between UI and main process
      renderer/     # React UI: 3-step wizard, embedded xterm.js terminal
      shared/       # types shared across main, preload and renderer
    scripts/        # smoke / e2e test harnesses
```

## Running the desktop app

```bash
cd apps/desktop
npm install          # installs deps and rebuilds node-pty for Electron
npm run dev          # launch the app in development mode
```

The setup wizard guides you through:

1. **Mission** — what PixelForge is
2. **Quest** — pick the project folder the agent will work in
3. **Allies** — tap a provider icon to scan your machine; detected agents are ready to
   use, missing ones install with one click

You need at least one coding-agent CLI installed and authenticated (e.g. `claude`) —
the agent that runs is your real CLI.

### Other commands

```bash
npm run build        # typecheck + production build
npm run smoke:pty    # verify node-pty works inside Electron
npm run build:mac    # package a macOS build (.dmg)
```

## Architecture

- **Main process** (`src/main/`) spawns agents through `node-pty` inside your login shell,
  so the CLI inherits a full environment. A `SessionManager` tracks each session and its
  status (`starting`, `running`, `stopped`, `completed`, `error`).
- **Preload bridge** (`src/preload/`) exposes a small, typed `window.workspace` API over
  context-isolated IPC — no raw Node access in the renderer.
- **Renderer** (`src/renderer/`) draws the agent's real terminal output with xterm.js and
  sends your keystrokes back through the bridge. It never touches the process directly.
- Every IPC call is keyed by `sessionId`, so the terminal system is ready to run multiple
  agents at once.

## Roadmap

- **Michael** — an orchestrator that breaks goals into tasks and assigns them to coworkers
- Multi-agent coworker sessions running side by side
- Task dashboard, agent messaging and shared project memory
- Web UI for the same experience outside the desktop app
- Arcade-style office with animated agent characters

## License

MIT