/**
 * PixelForge "cozy technology studio" palette.
 * The surrounding app UI stays dark and muted so the office floor is the
 * visual centre of attention; the office itself uses warm, playful colours.
 */

export const PALETTE = {
  // Application / scene backdrop
  bgDeep: '#0d1120',
  bgNavy: '#141a2e',
  bgRaised: '#1b2340',

  // Warm cream panels
  cream: '#f3e8cd',
  creamLight: '#fbf4e0',
  creamDark: '#d8c8a2',

  // Wood tones (floor / furniture)
  wood: '#c99b62',
  woodLight: '#d9ae74',
  woodDark: '#9c6f3f',
  woodEdge: '#7a5330',

  // Amber / gold — active states
  amber: '#ffb340',
  amberDark: '#d98d26',
  amberDim: '#b3741f',

  // Muted teal — connected / success
  teal: '#4ec8b0',
  tealDark: '#2f9a87',
  tealDim: '#256b60',

  // Coral red — errors / blocked
  coral: '#ff6b6b',
  coralDark: '#d34d4d',
  coralDim: '#8f2f35',

  // Soft violet — AI highlights
  violet: '#a78bfa',
  violetDark: '#7c5fd4',
  violetDim: '#4a3b86',

  // Inks
  ink: '#262033',
  inkSoft: '#4a4262',
  paper: '#f6ecd4',
  paperDark: '#e4d5b4',

  // Misc decorations
  leaf: '#4d9f5d',
  leafDark: '#35713f',
  leafLight: '#74c487',
  pot: '#b06a4a',
  glass: '#bfe3f2',
  sky: '#7fb7d9',
  windowFrame: '#3a3145'
} as const

export type PaletteKey = keyof typeof PALETTE
export type Color = string