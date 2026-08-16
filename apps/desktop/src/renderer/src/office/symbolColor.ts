import type { CharacterSpec } from './types'

/** Maps a sprite-sheet symbol to a colour for a given character. */
export function symbolColor(spec: CharacterSpec, ch: string): string {
  switch (ch) {
    case 'K':
      return spec.outline
    case 'H':
      return spec.hairColor
    case 'h':
      return spec.hairHighlight
    case 'S':
      return spec.skinTone
    case 's':
      return spec.skinShadow
    case 'E':
      return spec.eyeColor
    case 'W':
      return '#ffffff'
    case 'M':
      return spec.outline
    case 'T':
      return spec.shirtColor
    case 't':
      return spec.shirtShadow
    case 'V':
      return '#a78bfa'
    case 'P':
      return spec.pantsColor
    case 'p':
      return spec.pantsShadow
    case 'X':
      return spec.shoesColor
    case '.':
    default:
      return 'rgba(0,0,0,0)'
  }
}

/** Renders a sprite grid to a canvas context at the given scale. */
export function drawGrid(
  ctx: CanvasRenderingContext2D,
  spec: CharacterSpec,
  grid: string[],
  scale = 1,
  originX = 0,
  originY = 0
): void {
  for (let y = 0; y < grid.length; y++) {
    const row = grid[y]
    for (let x = 0; x < row.length; x++) {
      const ch = row[x]
      if (ch === '.') {
        continue
      }
      ctx.fillStyle = symbolColor(spec, ch)
      ctx.fillRect(originX + x * scale, originY + y * scale, scale, scale)
    }
  }
}