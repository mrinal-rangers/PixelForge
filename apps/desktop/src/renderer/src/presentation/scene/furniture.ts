import { OFFICE as C } from './officePalette'
import type { Draw } from './pixel'
import type { FurnitureKind } from './types'

/**
 * Hand-painted pixel-art furniture. Every painter draws into the office's
 * offscreen canvas at 1px resolution so edges stay crisp when the final
 * texture is scaled with nearest-neighbour filtering.
 */

const BOOKS = [C.bookBurgundy, C.bookBlue, C.bookTan, C.bookGold, C.bookBrown]

function seededColor(x: number, y: number, palette: string[]): string {
  const h = (x * 73856093 + y * 19349663) >>> 0
  return palette[h % palette.length]
}

/** Filled circle using the midpoint circle algorithm (pixel-perfect). */
export function fillCircle(d: Draw, cx: number, cy: number, r: number, color: string): void {
  let x = r
  let y = 0
  let err = 1 - x
  while (x >= y) {
    d.hline(cx - x, cy + y, x * 2 + 1, color)
    d.hline(cx - x, cy - y, x * 2 + 1, color)
    d.hline(cx - y, cy + x, y * 2 + 1, color)
    d.hline(cx - y, cy - x, y * 2 + 1, color)
    y += 1
    if (err <= 0) {
      err += 2 * y + 1
    } else {
      x -= 1
      err += 2 * (y - x) + 1
    }
  }
}

function drawChair(
  d: Draw,
  x: number,
  y: number,
  w: number,
  h: number,
  facing: 'up' | 'down' | 'left' | 'right',
  seat: string,
  back: string,
  base: string
): void {
  d.rect(x, y, 2, 2, base)
  d.rect(x + w - 2, y, 2, 2, base)
  d.rect(x, y + h - 2, 2, 2, base)
  d.rect(x + w - 2, y + h - 2, 2, 2, base)
  d.box(x + 2, y + 2, w - 4, h - 4, seat, C.chairEdge)
  d.rect(x + 4, y + 4, w - 8, h - 8, seat)
  if (facing === 'down') {
    d.rect(x + 2, y, w - 4, 3, back)
  } else if (facing === 'up') {
    d.rect(x + 2, y + h - 3, w - 4, 3, back)
  } else if (facing === 'left') {
    d.rect(x + w - 3, y + 2, 3, h - 4, back)
  } else {
    d.rect(x, y + 2, 3, h - 4, back)
  }
}

export function drawFurniture(
  d: Draw,
  kind: FurnitureKind,
  x: number,
  y: number,
  w: number,
  h: number,
  facing: 'up' | 'down' | 'left' | 'right',
  _variant = 0
): void {
  switch (kind) {
    case 'serverRack':
      d.box(x, y, w, h, '#232a33', C.outline)
      d.hline(x + 1, y + 1, w - 2, '#333b46')
      for (let yy = y + 10; yy < y + h - 14; yy += 8) {
        d.rect(x + 4, yy, 12, 2, '#171c22')
        d.rect(x + 18, yy + 0, 2, 2, '#0c1014')
      }
      for (const ly of [14, 22, 30]) {
        d.rect(x + w - 7, y + ly, 3, 3, '#0c1014')
      }
      d.rect(x + 3, y + h - 10, w - 6, 5, '#171c22')
      break

    case 'serverScreen':
      d.box(x, y, w, h, C.screenBg, C.outline)
      d.hline(x + 2, y + 4, w - 4, C.screenCyanDim)
      d.hline(x + 4, y + 8, w - 6, '#2a8f8f')
      d.hline(x + 2, y + 11, w - 4, C.screenCyanDim)
      break

    case 'utilityDevice':
      d.box(x, y, w, h, '#565e6b', C.outline)
      d.rect(x + 3, y + 3, 10, 4, '#222a34')
      d.rect(x + w - 8, y + 3, 4, 3, '#0c1014')
      d.hline(x + 3, y + 9, w - 6, '#454c58')
      break

    case 'workbench':
      d.box(x, y, w, h, C.white, C.outline)
      d.hline(x + 2, y + 2, w - 4, C.whiteShade)
      d.rect(x + 2, y + 13, w - 4, 5, '#aab2be')
      for (let cx = x + 8; cx < x + w - 8; cx += 24) {
        d.vline(cx, y + 13, 5, '#8a92a0')
      }
      for (let cx = x + 14; cx < x + w - 8; cx += 24) {
        d.rect(cx, y + 15, 4, 1, C.steel)
      }
      break

    case 'stool':
      d.box(x, y, w, h, C.chairSteel, C.outline)
      d.rect(x + 2, y + 2, w - 4, h - 4, '#5b6c8a')
      d.rect(x + 4, y + h - 3, w - 8, 2, C.chairGrey)
      break

    case 'bottles':
      d.rect(x + 1, y + 1, 3, 3, '#2c4a46')
      d.rect(x + 1, y + 4, 3, 5, C.labTeal)
      d.rect(x + 6, y + 0, 3, 3, '#223a55')
      d.rect(x + 6, y + 3, 3, 6, C.labBlue)
      d.rect(x + 11, y + 2, 3, 3, '#8fa8b8')
      d.rect(x + 11, y + 5, 3, 4, C.labGlass)
      break

    case 'toolRack':
      d.box(x, y, w, h, C.deskGrey, C.outline)
      d.vline(x + 4, y + 3, 8, C.steelLight)
      d.rect(x + 3, y + 11, 4, 2, C.steel)
      d.hline(x + 9, y + 5, 4, C.steelLight)
      d.vline(x + 12, y + 4, 7, C.whiteShade)
      break

    case 'labMachine':
      d.box(x, y, w, h, '#565e6b', C.outline)
      d.rect(x + 3, y + 3, 8, 6, C.screenBg)
      d.hline(x + 4, y + 5, 6, C.screenCyan)
      d.rect(x + 13, y + 3, 4, 4, C.screenAmber)
      d.rect(x + 13, y + 9, 4, 3, '#3a4049')
      break

    case 'diagScreen':
      d.box(x, y, w, h, C.screenBg, C.outline)
      d.hline(x + 3, y + 4, 6, C.screenCyan)
      d.vline(x + 12, y + 3, 7, C.screenBlue)
      d.hline(x + 4, y + 9, 10, C.screenCyanDim)
      break

    case 'diagConsole':
      d.box(x, y, w, h, '#454c58', C.outline)
      d.box(x + 6, y + 2, w - 12, 12, C.screenBg, C.outline)
      d.hline(x + 9, y + 6, 6, C.screenAmber)
      d.vline(x + 12, y + 6, 4, C.screenAmber)
      d.rect(x + 19, y + 4, 4, 3, C.screenBlue)
      d.rect(x + 16, y + 9, 6, 2, C.screenCyan)
      d.rect(x + 4, y + 17, 8, 2, C.chairGrey)
      d.rect(x + 15, y + 17, 10, 2, C.chairGrey)
      d.rect(x + w - 6, y + 17, 3, 3, '#0c1014')
      break

    case 'sofa':
      d.box(x, y, w, h, C.sofaBlue, C.outline)
      if (h > w) {
        d.rect(x + 4, y + 2, 4, h - 4, C.sofaDark)
        d.rect(x + 8, y + 5, 6, h - 10, C.sofaSteel)
        d.rect(x + 8, y + 2, 4, 3, C.sofaDark)
        d.rect(x + 8, y + h - 5, 4, 3, C.sofaDark)
      } else {
        d.rect(x + 2, y + 4, w - 4, 4, C.sofaDark)
        d.rect(x + 5, y + 8, w - 10, 6, C.sofaSteel)
        d.rect(x + 2, y + 8, 3, 4, C.sofaDark)
        d.rect(x + w - 5, y + 8, 3, 4, C.sofaDark)
      }
      break

    case 'managerDesk':
      d.box(x, y, w, h, C.walnut, C.outline)
      d.rect(x + 2, y + 2, w - 4, h - 4, C.walnutLight)
      d.hline(x + 2, y + 2, w - 4, '#9a7a56')
      d.hline(x + 2, y + h - 4, w - 4, C.walnutDark)
      d.rect(x + 4, y + h - 3, 6, 2, C.walnutDark)
      d.rect(x + w - 10, y + h - 3, 6, 2, C.walnutDark)
      break

    case 'officeChair':
      drawChair(d, x, y, w, h, facing, C.chairSteel, C.chairNavy, C.chairEdge)
      break

    case 'guestChair':
      drawChair(d, x, y, w, h, facing, '#4a3a2e', C.walnutDark, C.chairEdge)
      break

    case 'conferenceChair':
      drawChair(d, x, y, w, h, facing, C.chairSteel, C.chairNavy, C.chairEdge)
      break

    case 'workerChair':
      drawChair(d, x, y, w, h, facing, C.chairSteel, C.chairNavy, C.chairEdge)
      break

    case 'cabinet':
      d.box(x, y, w, h, C.walnut, C.outline)
      d.rect(x + 2, y + 2, w - 4, h - 4, '#5a3d26')
      d.vline(x + w / 2, y + 2, h - 4, '#3a2a18')
      d.rect(x + w / 2 - 9, y + h / 2 - 1, 2, 2, C.bookGold)
      d.rect(x + w / 2 + 7, y + h / 2 - 1, 2, 2, C.bookGold)
      break

    case 'waterDispenser':
      d.box(x, y, w, h, C.white, C.outline)
      d.box(x + 3, y + 2, w - 6, 8, C.labGlass, C.outline)
      d.hline(x + 3, y + 6, w - 6, '#9ad0e8')
      d.rect(x + 3, y + 13, 4, 3, C.steel)
      d.rect(x + w - 7, y + 13, 4, 3, C.steel)
      break

    case 'waterCooler':
      d.box(x, y, w, h, C.white, C.outline)
      d.box(x + 3, y + 2, w - 6, 10, '#cfe8f2', C.outline)
      d.rect(x + 3, y + 13, 4, 4, C.steel)
      d.rect(x + w - 7, y + 13, 4, 4, C.steel)
      break

    case 'pottedPlant': {
      d.box(x + 2, y + h - 6, w - 4, 6, '#8a5a44', C.outline)
      d.hline(x + 2, y + h - 6, w - 4, '#a06a50')
      d.rect(x + 2, y + 3, 4, 5, C.plant)
      d.rect(x + 6, y + 1, 5, 7, C.plantLight)
      d.rect(x + 11, y + 3, 4, 5, C.plant)
      d.rect(x + 4, y + 6, 5, 5, C.plantDark)
      break
    }

    case 'commDevice':
      d.box(x, y, w, h, '#454c58', C.outline)
      d.rect(x + 3, y + 3, 7, 4, C.screenBg)
      d.vline(x + 12, y, 5, C.steelLight)
      d.rect(x + 11, y - 2, 2, 2, C.screenCyan)
      break

    case 'rug': {
      const cx = x + w / 2
      const cy = y + h / 2
      fillCircle(d, cx, cy, Math.round(w / 2), C.rugPale)
      fillCircle(d, cx, cy, Math.round(w / 2) - 4, C.rugLine)
      fillCircle(d, cx, cy, Math.round(w / 2) - 7, C.rugPale)
      fillCircle(d, cx, cy, 3, C.rugDark)
      break
    }

    case 'conferenceTable':
      d.box(x, y, w, h, C.deepBlue, C.outline)
      d.rect(x + 2, y + 2, w - 4, h - 4, '#36455f')
      d.hline(x + 2, y + 2, w - 4, '#4a5f80')
      d.hline(x + 2, y + h / 2, w - 4, '#2c3a52')
      d.rect(x + 3, y + 3, 2, 2, '#1d2739')
      d.rect(x + w - 5, y + 3, 2, 2, '#1d2739')
      d.rect(x + 3, y + h - 5, 2, 2, '#1d2739')
      d.rect(x + w - 5, y + h - 5, 2, 2, '#1d2739')
      break

    case 'planter':
      d.box(x, y, w, h, '#2c3a33', C.outline)
      d.rect(x + 2, y + 2, w - 4, h - 4, '#263029')
      for (let py = y + 8; py < y + h - 6; py += 18) {
        d.rect(x + 2, py, 5, 6, C.plant)
        d.rect(x + 7, py - 2, 6, 8, C.plantLight)
        d.rect(x + 12, py + 1, 3, 5, C.plantDark)
      }
      break

    case 'planningBoard':
      d.box(x, y, w, h, '#3a3f4a', C.outline)
      d.rect(x + 2, y + 2, w - 4, h - 4, '#31363f')
      for (let py = y + 8; py < y + h - 8; py += 22) {
        d.rect(x + 3 + ((py / 22) % 3), py, 6, 5, seededColor(x, py, BOOKS))
      }
      d.rect(x + w / 2 - 2, y + h - 4, 4, 4, '#232830')
      break

    case 'workerDesk': {
      d.box(x, y, w, h, C.deskGrey, C.outline)
      d.rect(x + 1, y + 1, w - 2, h - 2, '#c6cad4')
      const mx = x + 16
      d.rect(mx + 5, y + 14, 6, 2, C.chairGrey)
      d.box(mx, y - 8, 16, 20, C.screenBg, C.outline)
      d.rect(mx + 2, y - 6, 12, 14, C.screenBg)
      d.hline(mx + 3, y - 4, 8, C.screenCyanDim)
      d.rect(mx - 6, y + 9, 12, 3, C.chairGrey)
      d.rect(mx + 14, y + 9, 12, 3, C.chairGrey)
      d.rect(x + 3, y + 9, 6, 3, C.steel)
      d.rect(x + 38, y + 8, 5, 5, C.labTeal)
      d.rect(x + 39, y + 9, 3, 3, C.labTealDark)
      d.rect(x + w - 4, y + 3, 2, 2, '#0c1014')
      d.rect(x + w - 2, y, 2, h, C.steelLight)
      break
    }

    case 'partition':
      d.box(x, y, w, h, '#aab2be', C.outline)
      d.rect(x + 1, y + 1, w - 2, h - 2, '#b9c0cc')
      d.hline(x + 1, y + 1, w - 2, '#cfd4de')
      break

    case 'bookshelf': {
      d.box(x, y, w, h, C.walnutDark, C.outline)
      d.rect(x + 1, y + 1, w - 2, h - 2, '#5a4630')
      d.hline(x + 1, y + Math.floor(h / 2) - 1, w - 2, C.walnutDark)
      d.hline(x + 1, y + h - 5, w - 2, C.walnutDark)
      const rows = [y + 4, y + Math.floor(h / 2) + 3]
      rows.forEach((ry, rowIndex) => {
        for (let bx = x + 2 + rowIndex; bx < x + w - 3; bx += 5) {
          d.rect(bx, ry, 4, 10, seededColor(bx, ry, BOOKS))
        }
      })
      break
    }

    case 'vertShelf': {
      d.box(x, y, w, h, C.walnutDark, C.outline)
      d.rect(x + 1, y + 1, w - 2, h - 2, '#5a4630')
      for (let sy = y + 22; sy < y + h - 6; sy += 22) {
        d.hline(x + 1, sy, w - 2, C.walnutDark)
      }
      for (let sy = y + 5; sy < y + h - 10; sy += 22) {
        for (let bx = x + 2; bx < x + w - 4; bx += 5) {
          d.rect(bx, sy, 4, 14, seededColor(bx, sy, BOOKS))
        }
      }
      break
    }

    case 'readingTable':
      d.box(x, y, w, h, C.walnut, C.outline)
      d.rect(x + 2, y + 2, w - 4, h - 4, '#7a5a3c')
      d.hline(x + 2, y + 2, w - 4, '#8a6a4a')
      d.hline(x + 2, y + h / 2, w - 4, C.walnutDark)
      break

    case 'archiveBox':
      d.box(x, y, w, h, C.bookTan, C.outline)
      d.hline(x + 2, y + 4, w - 4, '#a88c4a')
      d.rect(x + 6, y + 1, 4, 2, '#8a6a30')
      break

    case 'docCabinet':
      d.box(x, y, w, h, '#565e6b', C.outline)
      for (let dy = y + 6; dy < y + h - 6; dy += 10) {
        d.rect(x + 3, dy, w - 6, 8, '#4a5160')
        d.rect(x + w / 2 - 2, dy + 3, 4, 2, C.chairGrey)
      }
      break

    case 'waitingSofa':
      d.box(x, y, w, h, '#8fb0c9', C.outline)
      if (h > w) {
        d.rect(x + 3, y + 2, 4, h - 4, '#6f94b0')
        d.rect(x + 7, y + 5, w - 8, h - 10, '#a8c4d8')
        d.rect(x + 7, y + 2, 3, 3, '#6f94b0')
        d.rect(x + 7, y + h - 5, 3, 3, '#6f94b0')
      } else {
        d.rect(x + 2, y + 3, w - 4, 4, '#6f94b0')
        d.rect(x + 5, y + 7, w - 10, h - 8, '#a8c4d8')
        d.rect(x + 2, y + 7, 3, 3, '#6f94b0')
        d.rect(x + w - 5, y + 7, 3, 3, '#6f94b0')
      }
      break

    case 'wallConsole':
      d.box(x, y, w, h, '#31363f', C.outline)
      d.rect(x + 2, y + 4, w - 4, 24, C.screenBg)
      d.hline(x + 3, y + 10, w - 6, C.screenCyanDim)
      d.hline(x + 3, y + 16, w - 9, '#2a8f8f')
      d.hline(x + 3, y + 22, w - 6, C.screenCyanDim)
      for (let by = y + 34; by < y + h - 8; by += 8) {
        d.rect(x + 4, by, w - 8, 3, C.chairGrey)
      }
      break

    case 'noticePanel':
      d.box(x, y, w, h, C.walnut, C.outline)
      d.rect(x + 2, y + 2, w - 4, h - 4, '#d8c8a8')
      d.rect(x + 4, y + 4, 5, 4, C.bookTan)
      d.rect(x + 11, y + 3, 5, 4, C.white)
      d.rect(x + 17, y + 5, 4, 3, C.bookTan)
      d.rect(x + 6, y + 3, 1, 1, '#8a5a44')
      break

    case 'testDesk':
      d.box(x, y, w, h, C.steel, C.outline)
      d.rect(x + 1, y + 1, w - 2, h - 2, C.steelLight)
      d.box(x + w / 2 - 8, y - 6, 16, 18, C.screenBg, C.outline)
      d.rect(x + w / 2 - 6, y - 4, 12, 12, C.screenBg)
      d.hline(x + w / 2 - 5, y - 2, 8, C.screenGreen)
      d.rect(x + 3, y + 8, 5, 3, C.chairGrey)
      d.rect(x + w - 8, y + 8, 5, 3, C.chairGrey)
      break

    case 'testInstrument':
      d.box(x, y, w, h, '#565e6b', C.outline)
      d.rect(x + 2, y + 2, w - 6, 5, C.screenBg)
      d.hline(x + 3, y + 4, w - 8, C.screenGreen)
      d.rect(x + w - 5, y + 2, 3, 3, C.screenAmber)
      break

    case 'testWorkbench':
      d.box(x, y, w, h, C.steelDark, C.outline)
      d.rect(x + 1, y + 1, w - 2, h - 2, C.steel)
      d.hline(x + 1, y + 1, w - 2, C.steelLight)
      d.rect(x + 2, y + 15, w - 4, h - 17, '#4a5160')
      for (let cx = x + 12; cx < x + w - 8; cx += 26) {
        d.vline(cx, y + 15, h - 17, '#3a4049')
      }
      d.rect(x + 10, y + 4, 8, 3, C.chairGrey)
      d.vline(x + 30, y + 3, 8, C.whiteShade)
      d.rect(x + 40, y + 4, 6, 2, C.screenAmber)
      d.rect(x + 70, y + 5, 10, 2, C.screenBg)
      break

    case 'lamp':
      d.rect(x + 4, y + 8, 4, 2, C.chairGrey)
      d.vline(x + 5, y + 3, 5, C.steelLight)
      d.rect(x + 2, y, 8, 3, C.screenAmber)
      break

    case 'papers':
      d.box(x, y, w, h, '#e9e4d2', C.outline)
      d.hline(x + 2, y + 2, w - 4, '#b9b2a0')
      d.hline(x + 2, y + 4, w - 4, '#b9b2a0')
      d.hline(x + 2, y + 6, w - 4, '#b9b2a0')
      d.rect(x + w - 3, y + h - 3, 2, 2, '#d8d2c0')
      break

    case 'notebook':
      d.box(x, y, w, h, C.bookTan, C.outline)
      d.vline(x + w / 2, y + 1, h - 2, '#8a6a30')
      d.rect(x + 3, y + 2, 3, 4, C.white)
      break

    case 'tablet':
      d.box(x, y, w, h, C.chairGrey, C.outline)
      d.rect(x + 1, y + 1, w - 2, h - 2, C.screenBg)
      d.hline(x + 2, y + 3, w - 4, C.screenCyan)
      break

    case 'mug':
      d.box(x, y, w, h, C.white, C.outline)
      d.rect(x + w - 1, y + 2, 2, h - 4, C.white)
      d.rect(x + 2, y + 3, w - 4, 2, C.walnut)
      break

    case 'notes':
      d.rect(x, y, 4, h, C.bookBurgundy)
      d.rect(x + 5, y, 4, h, C.bookBlue)
      d.rect(x + 2, y + 1, 4, h - 2, C.bookTan)
      break

    case 'device':
      d.box(x, y, w, h, C.deskEdge, C.outline)
      d.hline(x + 2, y + 2, w - 4, C.screenCyan)
      d.hline(x + 2, y + 5, 6, C.screenCyanDim)
      break

    default:
      d.box(x, y, w, h, C.deskGrey, C.outline)
      break
  }
}