interface CoverDef {
  rows: readonly string[]
  palette: Record<string, string>
  label: string
}

/* Floppy disk — installation */
const FLOPPY: CoverDef = {
  label: 'Install',
  palette: { B: '#262033', T: '#2f9a87', O: '#4ec8b0', S: '#c4cdd6' },
  rows: [
    'XXXXXXXXXXXXXXXX',
    'XBBBBBBBBBBBBBBX',
    'XBTOTOTOTOTOTOBX',
    'XBTOTOTOTOTOTOBX',
    'XBTOTOTOTOTOTOBX',
    'XBTOTSSSSSOTOTBX',
    'XBTOTSSSSSOTOTBX',
    'XBTOTSSSSSOTOTBX',
    'XBTOTOTOTOTOTOBX',
    'XBTOTOTOTOTOTOBX',
    'XBTOTSSSSSOTOTBX',
    'XBTOTSSSSSOTOTBX',
    'XBTOTOTOTOTOTOBX',
    'XBTOTOTOTOTOTOBX',
    'XBBBBBBBBBBBBBBX',
    'XXXXXXXXXXXXXXXX'
  ]
}

/* Terminal window — setup */
const TERMINAL: CoverDef = {
  label: 'Setup',
  palette: { B: '#262033', C: '#ff6b6b', S: '#c4cdd6', N: '#0d1120', G: '#74c487' },
  rows: [
    'XXXXXXXXXXXXXXXX',
    'XBBBBBBBBBBBBBBX',
    'XBCSSSCSSSCSSSBX',
    'XBSSSSSSSSSSSSBX',
    'XBBBBBBBBBBBBBBX',
    'XBNNNNNNNNNNNNBX',
    'XBNNNNNNNNNNNNBX',
    'XBNGGNNNNNNNNNBX',
    'XBNGGNNNNNNNNNBX',
    'XBNNNNNNNNNNNNBX',
    'XBNNNNNNNNNNNNBX',
    'XBNNNNNNNNNNNNBX',
    'XBNNNNNNNNNNNNBX',
    'XBNNNNNNNNNNNNBX',
    'XBBBBBBBBBBBBBBX',
    'XXXXXXXXXXXXXXXX'
  ]
}

/* Circuit chip — design & tech stack */
const CIRCUIT: CoverDef = {
  label: 'Tech',
  palette: { B: '#262033', A: '#a78bfa', O: '#ffb340' },
  rows: [
    'XXXXXXXXXXXXXXXX',
    'XBBBBBBBBBBBBBBX',
    'XBAAAAAAAAAAAABX',
    'XBAAAAAAAAAAAABX',
    'XBAAAAAAAAAAAABX',
    'XBAAAAAAAAAAAABX',
    'XBAAAAAAAOAAAABX',
    'XBAAAAAAAOAAAABX',
    'XBAAAAAAAAAAAABX',
    'XBAAAAAAAAAAAABX',
    'XBAAAAAAAAAAAABX',
    'XBAAAAAAAAAAAABX',
    'XBBBBBBBBBBBBBBX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXXX'
  ]
}

const COVERS: Record<string, CoverDef> = {
  'how-to-install-pixelforge': FLOPPY,
  'how-to-set-up-pixelforge': TERMINAL,
  'how-pixelforge-works-design-and-tech-stack': CIRCUIT
}

function PixelArt({ def }: { def: CoverDef }): React.JSX.Element {
  const width = def.rows[0].length
  const height = def.rows.length
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      shapeRendering="crispEdges"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden="true"
    >
      {def.rows.map((row, y) =>
        [...row].map((cell, x) => {
          const fill = def.palette[cell]
          return fill ? <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={fill} /> : null
        })
      )}
    </svg>
  )
}

export function BlogCover({ slug, size }: { slug: string; size?: 'sm' | 'lg' }): React.JSX.Element {
  const def = COVERS[slug] ?? FLOPPY
  return (
    <div className={`blog-cover${size === 'lg' ? ' blog-cover-lg' : ''}`}>
      <PixelArt def={def} />
      <span className="blog-cover-label">{def.label}</span>
    </div>
  )
}