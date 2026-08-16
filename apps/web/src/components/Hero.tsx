import { SITE } from '../site'

export function Hero(): React.JSX.Element {
  return (
    <section className="hero" id="top">
      <div className="hero-badge-row">
        <span className="chip">Featured on Product Hunt</span>
        <span className="chip chip-teal">Free &amp; open source</span>
      </div>
      <h1 className="hero-title">
        Assemble your AI coding team
        <br />
        like it&rsquo;s a <span className="hero-accent">game.</span>
      </h1>
      <p className="hero-sub">{SITE.description}</p>
      <div className="hero-cta">
        <a className="btn btn-primary btn-lg" href="#download">
          ⤓ Download Free
        </a>
        <a className="btn btn-ghost btn-lg" href="#how-it-works">
          See how it works ↓
        </a>
      </div>
      <p className="hero-note">macOS · Windows · Linux — bring your own agent subscription</p>

      <div className="hero-panel">
        <div className="hero-panel-bar">
          <span className="dot dot-coral" />
          <span className="dot dot-amber" />
          <span className="dot dot-teal" />
          <span className="hero-panel-title">the-office — PixelForge</span>
          <span className="hero-panel-status">
            <span className="pulse" /> 4/4 agents online
          </span>
        </div>
        <div className="hero-panel-body">
          <img
            className="hero-panel-img"
            src="/images/office.png"
            alt="A pixel-art office floor with PixelForge agents at their desks"
          />
          <div className="hero-chip hero-chip-1">
            <span className="hero-chip-dot" style={{ background: '#4ec8b0' }} />
            Michael — orchestrator
          </div>
          <div className="hero-chip hero-chip-2">
            <span className="hero-chip-dot" style={{ background: '#a78bfa' }} />
            3 agents shipping
          </div>
          <div className="hero-chip hero-chip-3">
            <span className="hero-chip-dot" style={{ background: '#ffb340' }} />
            Terminal: live
          </div>
        </div>
      </div>
    </section>
  )
}