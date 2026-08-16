import { SITE, BOOKING_URL, VIDEOS } from '../site'

export function Contact(): React.JSX.Element {
  return (
    <section className="section" id="contact">
      <div className="section-inner">
        <p className="section-kicker">Contact us</p>
        <h2 className="section-title">See the office run.</h2>
        <p className="section-sub">
          Book a demo, ask a question, or just say hi. We answer real humans.
        </p>
        <div className="contact-grid">
          <div className="contact-video">
            <div className="video-frame">
              <video
                controls
                loop
                playsInline
                poster={VIDEOS.demo.poster}
                aria-label={VIDEOS.demo.label}
              >
                <source src={VIDEOS.demo.src} type="video/mp4" />
                Your browser does not support embedded video.
              </video>
              <span className="video-badge">Demo video — coming soon</span>
            </div>
          </div>
          <div className="contact-card">
            <h3>Book a live demo</h3>
            <p>
              Thirty minutes. We&rsquo;ll spin up a team of agents in the office and show you
              the whole loop — from goal to shipped work.
            </p>
            <a className="btn btn-primary btn-block btn-lg" href={BOOKING_URL} target="_blank" rel="noreferrer">
              Book a demo on Cal.com →
            </a>
            <hr className="contact-divider" />
            <p className="contact-email-label">Prefer to write?</p>
            <a className="contact-email" href={`mailto:${SITE.email}`}>
              {SITE.email}
            </a>
            <p className="contact-note">We read everything and reply within a day.</p>
          </div>
        </div>
      </div>
    </section>
  )
}