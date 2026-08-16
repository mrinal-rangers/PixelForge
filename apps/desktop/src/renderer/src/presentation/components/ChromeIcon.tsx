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

/** Pixel gear used for the settings popover trigger. */
export function SettingsIcon({ className, title = 'Settings' }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 10 10"
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <rect x="1" y="4" width="8" height="2" fill="currentColor" />
      <rect x="4" y="1" width="2" height="8" fill="currentColor" />
      <rect x="2" y="3" width="2" height="2" fill="currentColor" />
      <rect x="6" y="3" width="2" height="2" fill="currentColor" />
      <rect x="2" y="5" width="2" height="2" fill="currentColor" />
      <rect x="6" y="5" width="2" height="2" fill="currentColor" />
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

/** Pixel close icon. */
export function CloseIcon({ className, title = 'Close' }: IconProps): React.JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 10 10"
      role="img"
      aria-label={title}
      shapeRendering="crispEdges"
    >
      <rect x="2" y="1" width="2" height="2" fill="currentColor" />
      <rect x="6" y="1" width="2" height="2" fill="currentColor" />
      <rect x="1" y="2" width="8" height="2" fill="currentColor" />
      <rect x="1" y="6" width="8" height="2" fill="currentColor" />
      <rect x="2" y="7" width="2" height="2" fill="currentColor" />
      <rect x="6" y="7" width="2" height="2" fill="currentColor" />
    </svg>
  )
}