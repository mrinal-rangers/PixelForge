interface IconProps {
  className?: string
  title?: string
}

/** Pixel expand/contract icon used for the fullscreen toggle. */
export function FullscreenIcon({ className, title = 'Toggle fullscreen' }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 10 10"
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <rect x="1" y="1" width="8" height="8" fill="none" stroke="currentColor" strokeWidth="2" />
      <rect x="3" y="3" width="4" height="4" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  )
}

/** Line gear used for the settings popover trigger. */
export function SettingsIcon({ className, title = 'Settings' }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  )
}

/** Pixel plus icon used in the roster "add agent" button. */
export function PlusIcon({ className, title = 'Add agent' }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 10 10"
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <rect x="4" y="1" width="2" height="8" fill="currentColor" />
      <rect x="1" y="4" width="8" height="2" fill="currentColor" />
    </svg>
  )
}

/** Line close (X) icon. */
export function CloseIcon({ className, title = 'Close' }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      role="img"
      aria-label={title}
    >
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  )
}