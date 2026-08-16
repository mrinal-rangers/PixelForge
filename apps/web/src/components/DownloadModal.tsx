import { useCallback, useEffect, useState } from 'react'
import { DOWNLOADS, PLATFORM_LABELS, type Platform } from '../site'
import { GemLogo } from './GemLogo'

function detectPlatform(): Platform {
  const ua = navigator.userAgent
  if (/Mac/i.test(ua) || /iPhone|iPad/.test(ua)) return 'macos'
  if (/Win/i.test(ua)) return 'windows'
  if (/Linux/i.test(ua)) return 'linux'
  return 'macos'
}

const PLATFORM_ICONS: Record<Platform, string> = {
  macos: '🍎',
  windows: '🪟',
  linux: '🐧'
}

interface DownloadModalProps {
  open: boolean
  onClose: () => void
}

export function DownloadModal({ open, onClose }: DownloadModalProps): React.JSX.Element | null {
  const [selected, setSelected] = useState<Platform | null>(null)

  useEffect(() => {
    if (open) {
      setSelected(detectPlatform())
      const onKey = (e: KeyboardEvent): void => {
        if (e.key === 'Escape') onClose()
      }
      document.addEventListener('keydown', onKey)
      document.body.style.overflow = 'hidden'
      return () => {
        document.removeEventListener('keydown', onKey)
        document.body.style.overflow = ''
      }
    }
  }, [open, onClose])

  const handleDownload = useCallback(
    (platform: Platform) => {
      setSelected(platform)
      window.open(DOWNLOADS[platform], '_blank', 'noopener,noreferrer')
    },
    []
  )

  if (!open) return null

  return (
    <div className="modal-overlay" onClick={onClose} role="presentation">
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="download-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal-close" type="button" onClick={onClose} aria-label="Close">
          ✕
        </button>
        <div className="modal-head">
          <GemLogo size={34} />
          <h2 id="download-modal-title">Download PixelForge</h2>
          <p>Pick your platform to grab the latest build.</p>
        </div>
        <div className="modal-options">
          {(Object.keys(DOWNLOADS) as Platform[]).map((platform) => {
            const isRecommended = platform === detectPlatform()
            const isSelected = platform === selected
            return (
              <button
                key={platform}
                type="button"
                className={`modal-option${isSelected ? ' modal-option-selected' : ''}`}
                onClick={() => handleDownload(platform)}
              >
                <span className="modal-option-icon" aria-hidden="true">
                  {PLATFORM_ICONS[platform]}
                </span>
                <span className="modal-option-name">{PLATFORM_LABELS[platform]}</span>
                <span className="modal-option-meta">{platform === 'macos' ? '.dmg / .zip' : platform === 'windows' ? '.exe / .zip' : '.AppImage / .zip'}</span>
                {isRecommended && <span className="modal-recommended">Recommended</span>}
              </button>
            )
          })}
        </div>
        <p className="modal-note">
          Detected: <strong>{PLATFORM_LABELS[detectPlatform()]}</strong>. Downloading starts in a new tab — make sure
          to allow it.
        </p>
      </div>
    </div>
  )
}