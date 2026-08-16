import { Link } from 'react-router-dom'
import { SITE, NAV_LINKS, BOOKING_URL } from '../site'
import { GemLogo } from './GemLogo'

export function Footer(): React.JSX.Element {
  return (
    <footer className="footer" id="download">
      <div className="footer-inner">
        <div className="footer-cta">
          <h2>Clock in your team.</h2>
          <p>
            You do the work only you can do. Your agents do the rest — 24/7, in a pixel office
            that never closes.
          </p>
          <div className="footer-cta-buttons">
            <a className="btn btn-primary btn-lg" href={SITE.github} target="_blank" rel="noreferrer">
              ⤓ Download Free
            </a>
            <a className="btn btn-ghost btn-lg" href={BOOKING_URL} target="_blank" rel="noreferrer">
              Book a demo
            </a>
          </div>
          <p className="footer-note">macOS · Windows · Linux — free for individuals · open source · MIT</p>
        </div>
        <div className="footer-bottom">
          <div className="footer-brand">
            <GemLogo size={22} />
            <span>PixelForge</span>
          </div>
          <nav className="footer-links" aria-label="Footer">
            {NAV_LINKS.map((l) =>
              l.href.startsWith('/') ? (
                <Link key={l.href} to={l.href}>
                  {l.label}
                </Link>
              ) : (
                <a key={l.href} href={l.href}>
                  {l.label}
                </a>
              )
            )}
          </nav>
          <div className="footer-social">
            <a href={SITE.github} target="_blank" rel="noreferrer">
              GitHub
            </a>
            <a href={`mailto:${SITE.email}`}>Contact</a>
          </div>
        </div>
        <p className="footer-legal">
          © {new Date().getFullYear()} PixelForge — free &amp; open source · MIT license ·
          pixel-office art by <a href="https://2dpig.itch.io/" target="_blank" rel="noreferrer">2dPig</a> (CC0)
        </p>
      </div>
    </footer>
  )
}