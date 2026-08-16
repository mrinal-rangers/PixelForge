/**
 * Symbolic pixel grids for the coworker character. Each string is one row of
 * the sprite; every row must be exactly CHARACTER_CELL_W chars and there must
 * be CHARACTER_CELL_H rows.
 *
 * Keys:
 *   . transparent        K outline
 *   H hair               h hair highlight
 *   S skin               s skin shadow
 *   E eye                W eye highlight
 *   M mouth
 *   T shirt              t shirt shadow
 *   V violet emblem
 *   P pants              p pants shadow
 *   X shoes
 */
export type Grid = string[]

const EYE = ['E', 'W']

/** Shared leg block used by every direction's standing pose. */
const LEGS_IDLE: string[] = [
  '..KPPhPPPPhPPK..',
  '..KPPhPPPPhPPK..',
  '..KPPhPPPPhPPK..',
  '..KXXXK..KXXXK..',
  '..KXXXK..KXXXK..',
  '................'
]

const LEGS_WALK1: string[] = [
  '..KPPhPPPPhPPK..',
  '..KPPhPPPPhPPK..',
  '..KPPhPPPPhPPK..',
  '..KXXK....KXXK..',
  '..KXXK....KXXK..',
  '................'
]

const LEGS_WALK2: string[] = [
  '..KPPhPPPPhPPK..',
  '..KPPhPPPPhPPK..',
  '..KPPhPPPPhPPK..',
  '...KXXX..KXXX...',
  '...KXXX..KXXX...',
  '................'
]

function compose(base: string[], legs: string[]): Grid {
  return [...base.slice(0, 20), ...legs]
}

const HEAD_HAIR: string[] = [
  '..KKKKKKKKKKKK..',
  '.KHHHHHHHHHHHHK.',
  '.KHHHHHHHHHHHHK.',
  'KHHHHHHHHHHHHHHK'
]

// ---- Down (facing the user) ------------------------------------------------

const DOWN_HEAD: string[] = [
  ...HEAD_HAIR,
  'KHHHHSSSSSSHHHHK',
  'KHHHSSSSSSSSHHHK',
  'KHSSSSSSSSSSSSHK',
  'KHSSEEWSSWEESSHK',
  'KHSsSSSSSSSSsSHK',
  'KHSSSSSMMSSSSSHK',
  'KHSSSSSSSSSSSSHK',
  '.KHHSSSSSSSSHHK.',
  '..KHHSSSSSSHHK..'
]

const DOWN_TORSO: string[] = [
  '..KTTTTTTTTTTK..',
  '..KTTTTTTTTTTK..',
  '.KTTTTVVVVTTTTK.',
  '.KTTTTVVVVTTTTK.',
  '.KTTTTTTTTTTTTK.',
  '..KTTTTTTTTTTK..',
  '..KPPhPPPPhPPK..'
]

const DOWN_TYPE_A: string[] = [
  ...DOWN_HEAD.slice(0, 11),
  '..KTTSSSSSSSSK..',
  '..KTTSSSSSSSSK..',
  ...DOWN_TORSO
]

const DOWN_TYPE_B: string[] = [
  ...DOWN_HEAD.slice(0, 11),
  '..KSTSSSSSSTSK..',
  '..KSTSSSSSSTSK..',
  ...DOWN_TORSO
]

export const DOWN_IDLE: Grid = [...DOWN_HEAD, ...DOWN_TORSO, ...LEGS_IDLE]
export const DOWN_WALK1: Grid = compose([...DOWN_HEAD, ...DOWN_TORSO], LEGS_WALK1)
export const DOWN_WALK2: Grid = compose([...DOWN_HEAD, ...DOWN_TORSO], LEGS_WALK2)
export const DOWN_TYPE1: Grid = [...DOWN_TYPE_A, ...LEGS_IDLE]
export const DOWN_TYPE2: Grid = [...DOWN_TYPE_B, ...LEGS_IDLE]

// ---- Up (facing away from the user) -----------------------------------------

const UP_HEAD: string[] = [
  ...HEAD_HAIR,
  'KHHHHHHHHHHHHHHK',
  'KHHHHHHHHHHHHHHK',
  'KHHHHHHHHHHHHHHK',
  'KHHHHHHHHHHHHHHK',
  'KHHHHHHHHHHHHHHK',
  'KHHHHHHHHHHHHHHK',
  'KHHHHHHHHHHHHHHK',
  '.KHHHHHHHHHHHHK.',
  '..KHHSSSSSSHHK..'
]

export const UP_IDLE: Grid = [...UP_HEAD, ...DOWN_TORSO, ...LEGS_IDLE]
export const UP_WALK1: Grid = compose([...UP_HEAD, ...DOWN_TORSO], LEGS_WALK1)
export const UP_WALK2: Grid = compose([...UP_HEAD, ...DOWN_TORSO], LEGS_WALK2)
export const UP_TYPE1: Grid = UP_IDLE
export const UP_TYPE2: Grid = UP_IDLE

// ---- Right (profile) ---------------------------------------------------------

const RIGHT_HEAD: string[] = [
  ...HEAD_HAIR,
  'KHHHHHHHHHHSSSSK',
  'KHHHHHHHHHSSSSSK',
  'KHHHHHHHHHSEWSSK',
  'KHHHHHHHHHSSSSsK',
  'KHHHHHHHHHSMSSSK',
  'KHHHHHHHHHSSSSSK',
  'KHHHHHHHHSSSS..K',
  '..KHHHHSSSSHHK..',
  '..KTTTTTTTTTTK..'
]

const RIGHT_TORSO: string[] = [
  '..KTTTTTTTTTTK..',
  '.KTTTTTTTTTTTTK.',
  '.KTTTTTTTTTTTTK.',
  '.KTTTTTTTTTTTTK.',
  '..KTTTTTTTTTTK..',
  '..KTTTTTTTTTTK..',
  '..KPPhPPPPhPPK..'
]

export const RIGHT_IDLE: Grid = [...RIGHT_HEAD, ...RIGHT_TORSO, ...LEGS_IDLE]
export const RIGHT_WALK1: Grid = compose([...RIGHT_HEAD, ...RIGHT_TORSO], LEGS_WALK1)
export const RIGHT_WALK2: Grid = compose([...RIGHT_HEAD, ...RIGHT_TORSO], LEGS_WALK2)
export const RIGHT_TYPE1: Grid = RIGHT_IDLE
export const RIGHT_TYPE2: Grid = RIGHT_IDLE

/** Mirrors a grid horizontally (used for the left-facing variants). */
export function mirror(grid: Grid): Grid {
  return grid.map((row) => row.split('').reverse().join(''))
}

/** Returns a copy of a grid with the eyes closed (used for blink frames). */
export function closedEyes(grid: Grid): Grid {
  return grid.map((row) =>
    row
      .split('')
      .map((ch) => (EYE.includes(ch) ? 'S' : ch))
      .join('')
  )
}

/** All hand-authored frames, keyed by direction, before mirroring. */
export const BASE_FRAMES: Record<'down' | 'up' | 'right', Record<string, Grid>> = {
  down: {
    idle: DOWN_IDLE,
    walk1: DOWN_WALK1,
    walk2: DOWN_WALK2,
    type1: DOWN_TYPE1,
    type2: DOWN_TYPE2
  },
  up: {
    idle: UP_IDLE,
    walk1: UP_WALK1,
    walk2: UP_WALK2,
    type1: UP_TYPE1,
    type2: UP_TYPE2
  },
  right: {
    idle: RIGHT_IDLE,
    walk1: RIGHT_WALK1,
    walk2: RIGHT_WALK2,
    type1: RIGHT_TYPE1,
    type2: RIGHT_TYPE2
  }
}