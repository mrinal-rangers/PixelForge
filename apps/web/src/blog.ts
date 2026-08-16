export interface BlogSection {
  heading?: string
  paragraphs?: string[]
  code?: string
  bullets?: string[]
}

export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  readTime: string
  tags: string[]
  sections: BlogSection[]
}

export const BLOG_POSTS: BlogPost[] = [
  {
    slug: 'how-to-install-pixelforge',
    title: 'How to install PixelForge',
    description:
      'Get PixelForge running on your machine in a few minutes — from a packaged build or straight from the source.',
    date: '2026-08-16',
    readTime: '3 min read',
    tags: ['setup', 'installation'],
    sections: [
      {
        paragraphs: [
          'PixelForge is a desktop app, so installation is a one-time thing. There are two ways to get it: download a packaged build, or run it from source. Both work on macOS, Windows and Linux.'
        ]
      },
      {
        heading: 'Prerequisites',
        paragraphs: ['Before you install, make sure you have:'],
        bullets: [
          'Node.js 18+ and npm installed',
          'At least one coding-agent CLI ready to go (Claude Code, Codex, OpenCode, Gemini CLI or Aider)',
          'An authenticated agent account — PixelForge uses your existing subscription, it does not need one of its own'
        ]
      },
      {
        heading: 'Option 1 — packaged build (recommended)',
        paragraphs: [
          'Grab the latest release from the GitHub releases page for your platform, install it like any other app, and launch it. No terminal required.'
        ],
        code: '# or build your own platform package from source\nnpm run build:mac   # .dmg\nnpm run build:win   # .exe\nnpm run build:linux # .AppImage'
      },
      {
        heading: 'Option 2 — run from source',
        paragraphs: [
          'Clone the repository, install dependencies and start the dev build. This is the fastest way to get the very latest version and is also what you want if you plan to contribute.'
        ],
        code: 'git clone https://github.com/mrinal-rangers/PixelForge.git\ncd PixelForge/apps/desktop\nnpm install        # installs deps and rebuilds node-pty for Electron\nnpm run dev        # launch the app in development mode'
      },
      {
        heading: 'Verify it works',
        paragraphs: [
          'When the app opens you should land on the mission screen. If you already have an agent CLI installed, PixelForge will detect it during setup — no extra config needed.'
        ]
      }
    ]
  },
  {
    slug: 'how-to-set-up-pixelforge',
    title: 'How to set up PixelForge',
    description:
      'Assemble your first AI team: add agents, give them roles, pick a project, and hand them their first mission.',
    date: '2026-08-16',
    readTime: '4 min read',
    tags: ['setup', 'agents'],
    sections: [
      {
        paragraphs: [
          'Installation gets the app on your machine. Setup is where you build your team. In under five minutes you can have a small crew of agents working on a real project.'
        ]
      },
      {
        heading: '1. Assemble your team',
        paragraphs: [
          'Open the Add Agent wizard and tap a provider icon. PixelForge scans your machine and shows which agent CLIs are already detected — ones you are missing can be installed with a single click.'
        ],
        bullets: [
          'Codex, Claude Code, OpenCode, Gemini CLI and Aider are supported off the shelf',
          'Give each agent a name, a role and a pixel avatar so you can tell them apart in the office',
          'Set a goal so the agent knows what it is working toward'
        ]
      },
      {
        heading: '2. Pick your project',
        paragraphs: [
          'Choose the folder your team will work in. Each agent runs in its own isolated worktree, so the team can work on the same repository without stepping on each other.'
        ]
      },
      {
        heading: '3. Run the mission from the command center',
        paragraphs: [
          'Type your mission into the command center and hit go. The orchestrator breaks the goal into tasks and routes each one to the right coworker.'
        ]
      },
      {
        heading: '4. Watch them work',
        paragraphs: [
          'Agents appear at their desks in the pixel-art office simulation. Every one streams real terminal output into its own live xterm.js terminal — click any agent to inspect its session, and step in with keystrokes whenever a decision needs a human.',
          'Keep an eye on the memory panel too: notes and decisions accumulate there, so every new task starts a little smarter than the last.'
        ]
      },
      {
        heading: 'Tuning autonomy and budgets',
        paragraphs: [
          'You stay the boss. Agent autonomy and token budgets are guarded by a circuit breaker, so the team can act on its own right up to the limits you set.'
        ]
      }
    ]
  },
  {
    slug: 'how-pixelforge-works-design-and-tech-stack',
    title: 'How PixelForge works — design and tech stack',
    description:
      'Inside the machine: Electron, node-pty, xterm.js, PixiJS and Zustand, and how a real CLI becomes a pixel coworker.',
    date: '2026-08-16',
    readTime: '6 min read',
    tags: ['engineering', 'architecture'],
    sections: [
      {
        paragraphs: [
          'PixelForge does not fake an AI team. Every coworker is a real coding-agent CLI running in a real terminal on your machine. This post walks through the pieces that make that possible.'
        ]
      },
      {
        heading: 'The stack at a glance',
        bullets: [
          'Electron — desktop shell',
          'React 19 + TypeScript — renderer UI',
          'electron-vite + Vite — build tooling',
          'node-pty — real pseudo-terminals for each agent',
          'xterm.js — live terminal emulation in the UI',
          'PixiJS — the pixel-art office simulation',
          'Zustand — shared office/agent state'
        ]
      },
      {
        heading: 'Three processes, one app',
        paragraphs: [
          'Like any Electron app, PixelForge is split across a main process, a preload bridge and the renderer. The key choice is where the agents live.',
          'The main process spawns every agent through node-pty inside your login shell, so the CLI inherits a full environment. A SessionManager tracks each session and its status — starting, running, stopped, completed or error.'
        ],
        code: 'main process   → node-pty spawns real CLI in your shell\npreload bridge → window.workspace API (typed IPC)\nrenderer       → xterm.js terminals + office simulation'
      },
      {
        heading: 'The preload bridge',
        paragraphs: [
          'The renderer never touches a process directly. A small, typed window.workspace API sits on top of context-isolated IPC: createSession, sendInput, listSessions, onSessionOutput and friends. Every call is keyed by sessionId, which is what lets the same terminal system run many agents at once.'
        ]
      },
      {
        heading: 'The office simulation',
        paragraphs: [
          'Each session is promoted to a named coworker — a profile with a name, role, pixel avatar and accent color. The office floor renders them with PixiJS in a cozy, deterministic simulation: agents walk to their desks, sit down and type. It is purely visual and costs zero tokens; the real work is happening in the terminals underneath.',
          'The whole experience is orchestrated: give the team a goal and the orchestrator routes tasks to the right coworker, each in its own isolated worktree.'
        ]
      },
      {
        heading: 'Why this design',
        paragraphs: [
          'By wrapping the agent CLIs you already pay for instead of inventing a new one, PixelForge stays local-first — code and keys never leave your machine — and stays compatible with whatever your agent provider ships next. The office makes a swarm of background processes legible at a glance: you can always see who is doing what, and step in when you need to.'
        ]
      }
    ]
  }
]

export function getPost(slug: string): BlogPost | undefined {
  return BLOG_POSTS.find((p) => p.slug === slug)
}