/**
 * PixelForge office palette — a cool, intelligent blue-grey scheme.
 * The office reads as a calm research HQ: pale walls, slate floors,
 * dark technical equipment and soft cyan highlights.
 */

export const OFFICE = {
  // Canvas backdrop around the building
  bgDeep: '#080b14',
  bgNavy: '#0a0f1c',
  margin: '#0a0e18',

  // Walls
  wallOuter: '#e6dfcc',
  wallOuterShade: '#ccc3ab',
  wallInner: '#d7d4c8',
  wallInnerShade: '#b6b3a7',
  outline: '#232830',
  outlineSoft: '#3a3f4a',

  // Floor (standard slate)
  floorBase: '#3b4554',
  floorLine: '#4a5668',
  floorDark: '#2f3743',

  // Room floor tints
  serverFloor: '#333c49',
  serverLine: '#424d5c',
  labFloor: '#3f4757',
  labLine: '#4e5969',
  mgrFloor: '#414b5a',
  mgrLine: '#515c6e',
  archiveFloor: '#39424f',
  archiveLine: '#495362',
  waitFloor: '#3c4554',
  waitLine: '#4b5668',
  testFloor: '#363e4b',
  testLine: '#45505f',

  doorMat: '#4c576a',
  doorFrame: '#555f72',

  rugPale: '#aab3c5',
  rugLine: '#8e98aa',
  rugDark: '#7c8699',

  // Furniture surfaces
  deskDark: '#2a2f38',
  deskGrey: '#343b47',
  deskBlueGrey: '#3d4958',
  deskBrown: '#66563f',
  deskEdge: '#1f242b',
  steel: '#6a7280',
  steelLight: '#9aa3b0',
  steelDark: '#4a5160',
  white: '#dfe4ec',
  whiteShade: '#c2c8d4',

  // Chairs
  chairNavy: '#24324a',
  chairSteel: '#4a5a74',
  chairGrey: '#2f343d',
  chairEdge: '#1a1f26',

  // Screens
  screenBg: '#0d1526',
  screenCyan: '#3fe0e0',
  screenCyanDim: '#1f7070',
  screenAmber: '#e0a63f',
  screenGreen: '#57d97a',
  screenBlue: '#4a9cd9',

  // Lab equipment
  labBlue: '#4a7ab0',
  labBlueDark: '#3a5f8a',
  labTeal: '#3fa9a0',
  labTealDark: '#2f827c',
  labGlass: '#bfe3f2',

  // Plants
  plant: '#3f7d52',
  plantLight: '#5ba06a',
  plantDark: '#2c5a3a',

  // Books
  bookBrown: '#5a4630',
  bookBurgundy: '#7a3b3b',
  bookBlue: '#3b5f8a',
  bookTan: '#c8a868',
  bookGold: '#b89a4a',

  // Manager furniture
  walnut: '#6a4a30',
  walnutDark: '#4f3722',
  walnutLight: '#8a6a4a',
  deepBlue: '#27324a',

  // Sofas
  sofaBlue: '#3a4a6a',
  sofaSteel: '#4a5a74',
  sofaDark: '#2c3850',

  // Highlight
  highlight: '#3fe0e0'
} as const

export type OfficeColor = (typeof OFFICE)[keyof typeof OFFICE]