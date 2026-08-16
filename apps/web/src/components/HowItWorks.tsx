const STEPS = [
  {
    n: '01',
    title: 'Assemble your team',
    body: 'Pick a provider, name each agent, give it a role and a pixel avatar. PixelForge scans your machine and finds the CLIs you already have — missing ones install with one click.',
    icon: '🧑‍💼'
  },
  {
    n: '02',
    title: 'Give them a goal',
    body: 'Type your mission into the command center. The orchestrator breaks it into tasks and hands each one to a coworker with its own live terminal and working directory.',
    icon: '🎯'
  },
  {
    n: '03',
    title: 'Watch them work',
    body: 'Everyone shows up at their desks in the office simulation. Real terminal output streams in real time — and you step in whenever a decision needs a human.',
    icon: '🖥️'
  }
]

export function HowItWorks(): React.JSX.Element {
  return (
    <section className="section" id="how-it-works">
      <div className="section-inner">
        <p className="section-kicker">How it works</p>
        <p className="section-sub">PixelForge doesn&rsquo;t give you one shared bot — it builds a whole team.</p>
        <div className="steps">
          {STEPS.map((s) => (
            <article key={s.n} className="step">
              <div className="step-icon" aria-hidden="true">
                {s.icon}
              </div>
              <span className="step-n">{s.n}</span>
              <h3>{s.title}</h3>
              <p>{s.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}