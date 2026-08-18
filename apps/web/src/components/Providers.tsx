import { PROVIDERS } from '../site'

export function Providers(): React.JSX.Element {
  return (
    <section className="providers">
      <p className="providers-title">Powers the agent CLIs you already use</p>
      <div className="providers-row">
        {PROVIDERS.map((p) => (
          <span key={p.name} className="provider">
            <span className="provider-box">
              <img className="provider-icon" src={p.icon} alt={`${p.name} logo`} draggable={false} />
            </span>
            <span className="provider-tip" role="tooltip">
              {p.name}
            </span>
          </span>
        ))}
        <span className="provider provider-more">+ more coming soon</span>
      </div>
      <p className="providers-note">Bring your own subscriptions — PixelForge wraps what&rsquo;s already on your machine.</p>
    </section>
  )
}