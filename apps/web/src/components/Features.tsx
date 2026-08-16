const HIGHLIGHTS = [
  {
    emoji: '🖥️',
    title: 'Live terminals',
    body: 'Every agent gets its own embedded xterm.js terminal streaming real CLI output. Type, interrupt, take over — full keyboard control, just like local work.'
  },
  {
    emoji: '🧠',
    title: 'Shared memory',
    body: 'A memory panel per agent and across the team — notes, decisions, and context that compound so every new task starts smarter than the last.'
  },
  {
    emoji: '🎛️',
    title: 'Command center',
    body: 'One place to type the mission, see the plan, watch task routing, and keep an eye on budgets and autonomy for every coworker.'
  },
  {
    emoji: '👔',
    title: 'Michael, the orchestrator',
    body: 'An agent that reads your goal, plans the work, and assigns tasks to the right coworker — each working in its own isolated worktree.'
  },
  {
    emoji: '⚙️',
    title: 'Multi-agent sessions',
    body: 'Run Codex, Claude Code, OpenCode and Gemini side by side. Every session is isolated and keyed by ID, ready to scale with your team.'
  },
  {
    emoji: '🏠',
    title: 'Local-first',
    body: 'Agents run on your machine through your login shell. Code, keys and context never leave — your environment, your rules.'
  }
]

export function Features(): React.JSX.Element {
  return (
    <section className="section section-alt" id="features">
      <div className="section-inner">
        <p className="section-kicker">What each agent gets</p>
        <h2 className="section-title">A full workstation. Not a chatbot.</h2>
        <p className="section-sub">
          Each coworker is a real CLI agent with real tools, real context, and a real terminal — orchestrated like a game.
        </p>
        <div className="feature-grid">
          {HIGHLIGHTS.map((f) => (
            <article key={f.title} className="feature">
              <div className="feature-emoji" aria-hidden="true">
                {f.emoji}
              </div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}