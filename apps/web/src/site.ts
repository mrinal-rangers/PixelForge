/**
 * Central, easy-to-edit site configuration.
 *
 * Everything the user will want to swap later (booking link, videos, socials)
 * lives here so it can be changed in one place.
 */

export const SITE = {
  name: 'PixelForge',
  tagline: 'Assemble your AI coding team like it\u2019s a game.',
  description:
    'PixelForge runs real coding-agent CLIs \u2014 Codex, Claude Code, OpenCode, Gemini and more \u2014 ' +
    'each inside its own live terminal. Give your team a goal, watch them work, and step in ' +
    'whenever they need you.',
  github: 'https://github.com/mrinal-rangers/PixelForge',
  email: 'mrinalenquiry@gmail.com'
} as const

/**
 * Platform download links.
 * TODO: point these at real release zips when the first build is published.
 * They follow the GitHub "latest release" convention.
 */
export const DOWNLOADS = {
  macos: 'https://github.com/mrinal-rangers/PixelForge/releases/latest/download/PixelForge-macOS.zip',
  windows: 'https://github.com/mrinal-rangers/PixelForge/releases/latest/download/PixelForge-Windows.zip',
  linux: 'https://github.com/mrinal-rangers/PixelForge/releases/latest/download/PixelForge-Linux.zip'
} as const

export type Platform = keyof typeof DOWNLOADS

export const PLATFORM_LABELS: Record<Platform, string> = {
  macos: 'macOS',
  windows: 'Windows',
  linux: 'Linux'
}

/** Cal.com booking link. */
export const BOOKING_URL = 'https://cal.com/mrinal-deb-wrlbkj/30min'

/**
 * Dummy product video for the Contact section.
 * TODO: swap these with real product videos when ready.
 * Drop real files into /public/videos and update the src below.
 */
export const VIDEOS = {
  demo: {
    src: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
    poster: '/images/office.png',
    label: 'Demo placeholder — swap with a real product video'
  }
}

export const NAV_LINKS = [
  { label: 'Pricing', href: '/#pricing' },
  { label: 'Contact', href: '/#contact' },
  { label: 'Blogs', href: '/blog' }
] as const

export const PROVIDERS = [
  { name: 'Codex', tag: 'OpenAI' },
  { name: 'Claude Code', tag: 'Anthropic' },
  { name: 'OpenCode', tag: 'Open source' },
  { name: 'Gemini CLI', tag: 'Google' },
  { name: 'Aider', tag: 'Open source' }
] as const