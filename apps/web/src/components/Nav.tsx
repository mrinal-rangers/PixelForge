import { useState } from 'react'
import { Link } from 'react-router-dom'
import { NAV_LINKS, SITE } from '../site'
import type { Theme } from '../theme'
import { useGithubStars, formatStars } from '../github'
import { GemLogo } from './GemLogo'
import { MoonIcon, SunIcon } from './ThemeIcon'
import { DownloadModal } from './DownloadModal'

interface NavProps {
  theme: Theme
  onToggleTheme: () => void
}

export function Nav({ theme, onToggleTheme }: NavProps): React.JSX.Element {
  const [modalOpen, setModalOpen] = useState(false)
  const stars = useGithubStars()

  return (
    <>
      <header className="nav">
        <div className="nav-inner">
          <Link className="nav-brand" to="/">
            <GemLogo />
            <span className="nav-brand-name">PixelForge</span>
          </Link>
          <nav className="nav-links" aria-label="Primary">
            {NAV_LINKS.map((link) =>
              link.href.startsWith('/') ? (
                <Link key={link.href} to={link.href}>
                  {link.label}
                </Link>
              ) : (
                <a key={link.href} href={link.href}>
                  {link.label}
                </a>
              )
            )}
          </nav>
          <div className="nav-cta">
            <a className="btn btn-ghost btn-sm" href={SITE.github} target="_blank" rel="noreferrer">
              <span className="btn-star-ic">★</span>
              <span>Star</span>
              <span className="star-count">{stars !== null ? formatStars(stars) : ''}</span>
            </a>
            <button className="btn btn-primary btn-sm" type="button" onClick={() => setModalOpen(true)}>
              ⤓ Download
            </button>
            <button
              className="theme-toggle"
              type="button"
              onClick={onToggleTheme}
              aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
            >
              {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
            </button>
          </div>
        </div>
      </header>
      <DownloadModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </>
  )
}