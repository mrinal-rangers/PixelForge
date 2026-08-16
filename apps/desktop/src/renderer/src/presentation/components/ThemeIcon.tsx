interface PixelIconProps {
  grid: readonly string[]
  className?: string
}

function PixelIcon({ grid, className }: PixelIconProps): React.JSX.Element {
  return (
    <svg
      viewBox={`0 0 ${grid[0].length} ${grid.length}`}
      className={className}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {grid.map((row, y) =>
        [...row].map((cell, x) =>
          cell === 'X' ? (
            <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill="currentColor" />
          ) : null
        )
      )}
    </svg>
  )
}

const SUN_GRID = [
  'X.......X',
  '.X.....X.',
  '..XXXXX..',
  '.XXXXXXX.',
  'XXXXXXXXX',
  '.XXXXXXX.',
  '..XXXXX..',
  '.X.....X.',
  'X.......X'
] as const

const MOON_GRID = [
  '...XXXX..',
  '..XXXXX..',
  '.XXXXX...',
  '.XXXX....',
  '.XXXX....',
  '.XXXXX...',
  '..XXXXX..',
  '...XXXX..'
] as const

export function SunIcon({ className }: { className?: string }): React.JSX.Element {
  return <PixelIcon grid={SUN_GRID} className={className} />
}

export function MoonIcon({ className }: { className?: string }): React.JSX.Element {
  return <PixelIcon grid={MOON_GRID} className={className} />
}