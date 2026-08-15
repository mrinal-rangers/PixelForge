import anthropicIcon from '../assets/providers/anthropic.svg'
import geminiIcon from '../assets/providers/gemini.svg'

interface ProviderIconProps {
  cliId: string
  className?: string
}

/** Real brand marks shipped with the app (Claude / Gemini). */
const BRAND_IMAGES: Record<string, string> = {
  claude: anthropicIcon,
  gemini: geminiIcon
}

const BRAND_ALT: Record<string, string> = {
  claude: 'Claude Code (Anthropic)',
  gemini: 'Gemini (Google)'
}

function CodexIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <polygon
        points="12,2.5 20.5,7.25 20.5,16.75 12,21.5 3.5,16.75 3.5,7.25"
        fill="none"
        stroke="#10a37f"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="12" r="3.4" fill="#10a37f" />
    </svg>
  )
}

function OpenCodeIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="#7c3aed"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.5" width="18" height="15" rx="2" />
      <path d="M7.5 9.5 L10.5 12 L7.5 14.5" />
      <path d="M13 14.5 H16.5" />
    </svg>
  )
}

function AiderIcon({ className }: { className?: string }): React.JSX.Element {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="none"
      stroke="#1f9e45"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="7.5" width="14" height="12" rx="2" />
      <path d="M12 7.5 V4.5" />
      <circle cx="12" cy="3.4" r="1.2" fill="#1f9e45" stroke="none" />
      <path d="M9 12.2 h0.01" strokeWidth="2.6" />
      <path d="M15 12.2 h0.01" strokeWidth="2.6" />
      <path d="M9 15.2 h6" />
    </svg>
  )
}

export function ProviderIcon({ cliId, className }: ProviderIconProps): React.JSX.Element {
  if (BRAND_IMAGES[cliId]) {
    return (
      <img
        src={BRAND_IMAGES[cliId]}
        alt={BRAND_ALT[cliId]}
        className={className}
        draggable={false}
      />
    )
  }
  switch (cliId) {
    case 'codex':
      return <CodexIcon className={className} />
    case 'opencode':
      return <OpenCodeIcon className={className} />
    case 'aider':
      return <AiderIcon className={className} />
    default:
      return (
        <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
          <circle cx="12" cy="12" r="8" fill="#9aa6cf" />
        </svg>
      )
  }
}