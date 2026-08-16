import anthropicIcon from '../../assets/providers/anthropic.svg'
import geminiIcon from '../../assets/providers/gemini.svg'
import openaiIcon from '../../assets/providers/openai.svg'
import opencodeIcon from '../../assets/providers/opencode.svg'
import aiderIcon from '../../assets/providers/aider.svg'

interface ProviderIconProps {
  cliId: string
  className?: string
}

/** Real brand marks shipped with the app. */
const BRAND_IMAGES: Record<string, string> = {
  claude: anthropicIcon,
  gemini: geminiIcon,
  codex: openaiIcon,
  opencode: opencodeIcon,
  aider: aiderIcon
}

const BRAND_ALT: Record<string, string> = {
  claude: 'Claude Code (Anthropic)',
  gemini: 'Gemini (Google)',
  codex: 'Codex (OpenAI)',
  opencode: 'OpenCode',
  aider: 'Aider'
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
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="8" fill="#9aa6cf" />
    </svg>
  )
}