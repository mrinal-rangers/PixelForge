import { useEffect, useState } from 'react'
import { CloseIcon } from './ChromeIcon'
import type { AppInfo } from '@shared/types'

interface SettingsModalProps {
  onClose: () => void
}

export function SettingsModal({ onClose }: SettingsModalProps): React.JSX.Element {
  const [info, setInfo] = useState<AppInfo | null>(null)

  useEffect(() => {
    window.workspace.getAppInfo().then(setInfo).catch(() => setInfo(null))
  }, [])

  return (
    <div className="wizard-overlay" role="dialog" aria-modal="true" aria-label="Settings">
      <div className="settings-card">
        <div className="wizard-header">
          <h2 className="wizard-title">GENERAL SETTINGS</h2>
          <button className="btn-icon" onClick={onClose} title="Close settings" aria-label="Close">
            <CloseIcon className="icon-btn" />
          </button>
        </div>
        <div className="settings-body">
          <div className="settings-row">
            <span className="settings-row-label">VERSION</span>
            <code className="settings-row-value" title={info ? `v${info.version}` : undefined}>
              {info ? `v${info.version}` : '—'}
            </code>
          </div>
          <div className="settings-row">
            <span className="settings-row-label">FLOOR AREA</span>
            <code className="settings-row-value" title={info?.floorPath ?? undefined}>
              {info?.floorPath ?? '—'}
            </code>
          </div>
        </div>
      </div>
    </div>
  )
}