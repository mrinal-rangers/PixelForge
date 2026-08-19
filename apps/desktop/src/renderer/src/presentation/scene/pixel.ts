/**
 * Tiny 2D drawing helpers used to hand-paint the office in crisp 1px pixels.
 * Everything lands on an offscreen canvas which is later used as a texture,
 * so the whole office renders with pixelated edges at any display scale.
 */

export interface Draw {
  ctx: CanvasRenderingContext2D
  /** Fill a solid rectangle. */
  rect(x: number, y: number, w: number, h: number, color: string): void
  /** Fill a rectangle plus a 1px outline. */
  box(x: number, y: number, w: number, h: number, fill: string, outline: string): void
  /** Vertical line. */
  vline(x: number, y: number, len: number, color: string): void
  /** Horizontal line. */
  hline(x: number, y: number, len: number, color: string): void
}

export function makeDraw(ctx: CanvasRenderingContext2D): Draw {
  return {
    ctx,
    rect(x, y, w, h, color) {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h))
    },
    box(x, y, w, h, fill, outline) {
      const xr = Math.round(x)
      const yr = Math.round(y)
      const wr = Math.round(w)
      const hr = Math.round(h)
      ctx.fillStyle = fill
      ctx.fillRect(xr, yr, wr, hr)
      ctx.fillStyle = outline
      ctx.fillRect(xr, yr, wr, 1)
      ctx.fillRect(xr, yr + hr - 1, wr, 1)
      ctx.fillRect(xr, yr, 1, hr)
      ctx.fillRect(xr + wr - 1, yr, 1, hr)
    },
    vline(x, y, len, color) {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), 1, Math.round(len))
    },
    hline(x, y, len, color) {
      ctx.fillStyle = color
      ctx.fillRect(Math.round(x), Math.round(y), Math.round(len), 1)
    }
  }
}