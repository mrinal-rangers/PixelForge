const FAQS = [
  {
    q: 'What actually powers my agents?',
    a: 'The coding-agent CLIs you already use — Codex, Claude Code, OpenCode, Gemini CLI, Aider and more. PixelForge wraps them into a named coworker with a role, a memory, and a live terminal. Bring your own subscriptions or API keys.'
  },
  {
    q: 'Does my code ever leave my laptop?',
    a: 'No. Agents run locally by default, through your login shell, so the CLI inherits your full environment. Code, keys and personal context stay on your machine.'
  },
  {
    q: 'Do I need to install anything besides PixelForge?',
    a: 'Just the agent CLIs you want to use. PixelForge detects what\u2019s already installed, and missing ones can be installed with one click from the Add Agent wizard.'
  },
  {
    q: 'Is the office simulation real?',
    a: 'It\u2019s a deterministic pixel-art simulation of your team at work. It\u2019s purely visual and costs zero tokens — the real work happens in the live terminals underneath.'
  },
  {
    q: 'Can I run more than one agent at once?',
    a: 'Yes. Every session is isolated and keyed by session ID, so you can run Codex on one task, Claude Code on another, and OpenCode on a third — side by side.'
  },
  {
    q: 'What does it cost?',
    a: 'PixelForge itself is free and open source (MIT). You only pay whoever powers your agents — your existing Claude, OpenAI or Google plans. Team features like shared memory and orchestration are optional.'
  }
]

export function FAQ(): React.JSX.Element {
  return (
    <section className="section" id="faq">
      <div className="section-inner section-narrow">
        <p className="section-kicker">FAQ</p>
        <h2 className="section-title">Questions, answered.</h2>
        <div className="faq-list">
          {FAQS.map((f) => (
            <details key={f.q} className="faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}