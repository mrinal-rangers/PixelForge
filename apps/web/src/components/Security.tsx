const POINTS = [
  {
    icon: '🏠',
    title: 'Local by default',
    body: 'Every agent is a session on your laptop. Code, keys and personal context never leave the machine — everything runs at 127.0.0.1.'
  },
  {
    icon: '🔑',
    title: 'Your subscriptions',
    body: 'PixelForge wraps the agent CLIs you already pay for. No extra platform in the middle of you and your code.'
  },
  {
    icon: '🔓',
    title: 'Open source',
    body: 'MIT licensed. Every line of the session manager, the terminal bridge and the office simulation is on GitHub for you to audit.'
  },
  {
    icon: '🚫',
    title: 'No cloud, no spying',
    body: 'The office simulation is deterministic and free — it burns zero tokens. The only thing that runs is your real agent CLI.'
  }
]

export function Security(): React.JSX.Element {
  return (
    <section className="section" id="security">
      <div className="section-inner">
        <p className="section-kicker">Security</p>
        <h2 className="section-title">Private by architecture. Not by promise.</h2>
        <p className="section-sub">A team of agents is only trustworthy if you control where they run and who reads their output.</p>
        <div className="feature-grid">
          {POINTS.map((p) => (
            <article key={p.title} className="feature">
              <div className="feature-emoji" aria-hidden="true">
                {p.icon}
              </div>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}