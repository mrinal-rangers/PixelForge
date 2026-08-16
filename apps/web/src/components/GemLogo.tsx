const COLORS: Record<string, string> = {
  W: '#ffffff',
  L: '#a5e2ff',
  M: '#3a9dff',
  D: '#1246a6'
}

const GRID: (string | null)[][] = [
  [null, null, 'L', 'L', null, null, null],
  [null, 'L', 'M', 'W', 'L', null, null],
  ['L', 'M', 'M', 'M', 'M', 'L', null],
  ['L', 'M', 'M', 'M', 'M', 'M', 'L'],
  ['L', 'M', 'M', 'M', 'M', 'L', null],
  [null, 'L', 'M', 'M', 'L', null, null],
  [null, null, 'L', 'L', null, null, null]
]

/** Pixel gem icon — the same mark used by the PixelForge desktop app. */
export function GemLogo({
  size = 28,
  className = ''
}: {
  size?: number
  className?: string
}): React.JSX.Element {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 7 7"
      role="img"
      aria-label="PixelForge"
      shapeRendering="crispEdges"
    >
      {GRID.map((row, y) =>
        row.map((cell, x) =>
          cell ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={COLORS[cell]} />
          ) : null
        )
      )}
    </svg>
  )
}