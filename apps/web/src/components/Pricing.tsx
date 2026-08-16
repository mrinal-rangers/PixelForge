import { BOOKING_URL } from '../site'

const TIERS = [
  {
    name: 'Solo',
    tagline: 'Your own agent team, on your machine',
    price: '$0',
    period: 'free · open source',
    cta: 'Download Free',
    href: '#download',
    highlight: false,
    features: [
      'Run multiple coding-agent CLIs',
      'Live terminals per agent',
      'Pixel-art office simulation',
      'Local-first — nothing leaves your machine',
      'Bring your own subscriptions'
    ]
  },
  {
    name: 'Team',
    tagline: 'Orchestration and shared memory for your crew',
    price: 'Contact us',
    period: 'per team',
    cta: 'Book a demo',
    href: BOOKING_URL,
    highlight: true,
    features: [
      'Everything in Solo',
      'Shared project memory across agents',
      'Orchestrator task routing',
      'Budgets &amp; autonomy controls',
      'Priority support'
    ]
  },
  {
    name: 'Studio',
    tagline: 'Power users and many concurrent agents',
    price: 'Contact us',
    period: 'per studio',
    cta: 'Book a demo',
    href: BOOKING_URL,
    highlight: false,
    features: [
      'Everything in Team',
      'Unlimited concurrent sessions',
      'Custom agent profiles &amp; roles',
      'Early access to new providers',
      'Build attribution'
    ]
  }
]

export function Pricing(): React.JSX.Element {
  return (
    <section className="section section-alt" id="pricing">
      <div className="section-inner">
        <p className="section-kicker">Pricing</p>
        <h2 className="section-title">Your agents are free. The team features are optional.</h2>
        <p className="section-sub">Start solo for nothing. Scale to a team when you&rsquo;re ready — pick either, both, or neither.</p>
        <div className="pricing-grid">
          {TIERS.map((t) => (
            <article key={t.name} className={`pricing-card${t.highlight ? ' pricing-card-highlight' : ''}`}>
              <h3>{t.name}</h3>
              <p className="pricing-tagline">{t.tagline}</p>
              <div className="pricing-price">
                {t.price}
                <span className="pricing-period">{t.period}</span>
              </div>
              <ul className="pricing-features">
                {t.features.map((f) => (
                  <li key={f} dangerouslySetInnerHTML={{ __html: f }} />
                ))}
              </ul>
              <a className={`btn ${t.highlight ? 'btn-primary' : 'btn-ghost'} btn-block`} href={t.href} target={t.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer">
                {t.cta}
              </a>
            </article>
          ))}
        </div>
      </div>
    </section>
  )
}