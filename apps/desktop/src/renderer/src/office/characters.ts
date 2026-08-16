import type { CharacterSpec } from './types'

/**
 * The resident cast of PixelForge coworkers. Each entry is a visual identity —
 * a named face with its own hair, skin and clothing colours. The actual
 * behaviour of the agent is configured separately when an agent is hired.
 */
export interface AvatarProfile extends CharacterSpec {
  id: string
  name: string
}

export const ACCENT_COLORS = [
  '#ffb340', // amber
  '#4ec8b0', // teal
  '#ff6b6b', // coral
  '#a78bfa', // violet
  '#4fc1ff', // sky
  '#7fd962', // leaf
  '#f5d28f', // butter
  '#ff8fbf', // rose
  '#c586c0', // magenta
  '#d9ae74' // tan
] as const

export const CHARACTERS: AvatarProfile[] = [
  {
    id: 'michael',
    name: 'Michael',
    role: 'Branch Manager',
    hairColor: '#6b4a2f',
    hairHighlight: '#8a623f',
    skinTone: '#f0c8a0',
    skinShadow: '#d8a978',
    shirtColor: '#4a9cc4',
    shirtShadow: '#36799c',
    pantsColor: '#3a4256',
    pantsShadow: '#2c3344',
    shoesColor: '#4a3a2b',
    outline: '#241d33',
    eyeColor: '#262033'
  },
  {
    id: 'jim',
    name: 'Jim',
    role: 'Sales',
    hairColor: '#5a4632',
    hairHighlight: '#755c40',
    skinTone: '#efc39a',
    skinShadow: '#d7a476',
    shirtColor: '#7fae5f',
    shirtShadow: '#5f8a46',
    pantsColor: '#3f4a5f',
    pantsShadow: '#303847',
    shoesColor: '#4a3a2b',
    outline: '#241d33',
    eyeColor: '#3a5a7a'
  },
  {
    id: 'pam',
    name: 'Pam',
    role: 'Receptionist',
    hairColor: '#c98d5a',
    hairHighlight: '#e0ad7c',
    skinTone: '#f4d0ad',
    skinShadow: '#e0b085',
    shirtColor: '#e8a2b8',
    shirtShadow: '#c47d95',
    pantsColor: '#5a6a7a',
    pantsShadow: '#45525f',
    shoesColor: '#6a4a3a',
    outline: '#241d33',
    eyeColor: '#3a5a6a'
  },
  {
    id: 'dwight',
    name: 'Dwight',
    role: 'Security',
    hairColor: '#8a5a35',
    hairHighlight: '#a9774b',
    skinTone: '#f2c9a2',
    skinShadow: '#dbab7e',
    shirtColor: '#c9c23f',
    shirtShadow: '#9e9830',
    pantsColor: '#2c3848',
    pantsShadow: '#212a37',
    shoesColor: '#3a2f22',
    outline: '#241d33',
    eyeColor: '#6a4a2a'
  },
  {
    id: 'kevin',
    name: 'Kevin',
    role: 'Accounting',
    hairColor: '#4a382a',
    hairHighlight: '#5f4a37',
    skinTone: '#efc39a',
    skinShadow: '#d7a476',
    shirtColor: '#9a6a4a',
    shirtShadow: '#7a533a',
    pantsColor: '#3a4256',
    pantsShadow: '#2c3344',
    shoesColor: '#4a3a2b',
    outline: '#241d33',
    eyeColor: '#262033'
  },
  {
    id: 'angela',
    name: 'Angela',
    role: 'Accountant',
    hairColor: '#c9a05a',
    hairHighlight: '#e2bd7c',
    skinTone: '#f2cdad',
    skinShadow: '#dcb086',
    shirtColor: '#7faeae',
    shirtShadow: '#5f8a8a',
    pantsColor: '#4a4256',
    pantsShadow: '#383244',
    shoesColor: '#5a3a3a',
    outline: '#241d33',
    eyeColor: '#3a4a5a'
  },
  {
    id: 'oscar',
    name: 'Oscar',
    role: 'Accountant',
    hairColor: '#3a3a2f',
    hairHighlight: '#55554a',
    skinTone: '#e8b98c',
    skinShadow: '#cf9d70',
    shirtColor: '#6a8ad9',
    shirtShadow: '#4f6bb0',
    pantsColor: '#3a4256',
    pantsShadow: '#2c3344',
    shoesColor: '#3a2f22',
    outline: '#241d33',
    eyeColor: '#2a3345'
  },
  {
    id: 'stanley',
    name: 'Stanley',
    role: 'Sales',
    hairColor: '#8a8a8a',
    hairHighlight: '#ababab',
    skinTone: '#8a5f3d',
    skinShadow: '#6f4b2f',
    shirtColor: '#7a9adf',
    shirtShadow: '#5b77b5',
    pantsColor: '#4a4256',
    pantsShadow: '#383244',
    shoesColor: '#3a2f22',
    outline: '#241d33',
    eyeColor: '#3a2f22'
  },
  {
    id: 'phyllis',
    name: 'Phyllis',
    role: 'Sales',
    hairColor: '#c9b25a',
    hairHighlight: '#e0ca80',
    skinTone: '#f0c8a0',
    skinShadow: '#d8a978',
    shirtColor: '#c98a8a',
    shirtShadow: '#a06a6a',
    pantsColor: '#5a5265',
    pantsShadow: '#464054',
    shoesColor: '#5a3a3a',
    outline: '#241d33',
    eyeColor: '#4a3a3a'
  },
  {
    id: 'andy',
    name: 'Andy',
    role: 'Sales',
    hairColor: '#4a3a2a',
    hairHighlight: '#5f4d39',
    skinTone: '#efc39a',
    skinShadow: '#d7a476',
    shirtColor: '#8ac44a',
    shirtShadow: '#679a35',
    pantsColor: '#3a4256',
    pantsShadow: '#2c3344',
    shoesColor: '#4a3a2b',
    outline: '#241d33',
    eyeColor: '#262033'
  },
  {
    id: 'kelly',
    name: 'Kelly',
    role: 'Customer Service',
    hairColor: '#4a302a',
    hairHighlight: '#6b443c',
    skinTone: '#e8b98c',
    skinShadow: '#cf9d70',
    shirtColor: '#e86aa0',
    shirtShadow: '#c44f7f',
    pantsColor: '#5a4a6a',
    pantsShadow: '#443a52',
    shoesColor: '#6a3a3a',
    outline: '#241d33',
    eyeColor: '#4a2a3a'
  },
  {
    id: 'ryan',
    name: 'Ryan',
    role: 'Temp',
    hairColor: '#2f2f35',
    hairHighlight: '#4a4a52',
    skinTone: '#efc39a',
    skinShadow: '#d7a476',
    shirtColor: '#e8e0d0',
    shirtShadow: '#c0b8a8',
    pantsColor: '#3a4256',
    pantsShadow: '#2c3344',
    shoesColor: '#3a2f22',
    outline: '#241d33',
    eyeColor: '#2a3345'
  },
  {
    id: 'toby',
    name: 'Toby',
    role: 'HR',
    hairColor: '#5f5f5f',
    hairHighlight: '#7d7d7d',
    skinTone: '#f2c9a2',
    skinShadow: '#dbab7e',
    shirtColor: '#8a9aae',
    shirtShadow: '#6a7a8e',
    pantsColor: '#4a4256',
    pantsShadow: '#383244',
    shoesColor: '#3a2f22',
    outline: '#241d33',
    eyeColor: '#3a4a5a'
  },
  {
    id: 'creed',
    name: 'Creed',
    role: 'Quality',
    hairColor: '#d9d9d9',
    hairHighlight: '#f2f2f2',
    skinTone: '#e8c9a8',
    skinShadow: '#d0ab87',
    shirtColor: '#8aa86a',
    shirtShadow: '#6a864e',
    pantsColor: '#4a4256',
    pantsShadow: '#383244',
    shoesColor: '#3a2f22',
    outline: '#241d33',
    eyeColor: '#4a4a3a'
  },
  {
    id: 'meredith',
    name: 'Meredith',
    role: 'Supplier Relations',
    hairColor: '#8a3a3a',
    hairHighlight: '#aa5454',
    skinTone: '#f0c8a0',
    skinShadow: '#d8a978',
    shirtColor: '#5a8a6a',
    shirtShadow: '#426a4f',
    pantsColor: '#4a4256',
    pantsShadow: '#383244',
    shoesColor: '#4a3a2b',
    outline: '#241d33',
    eyeColor: '#3a4a3a'
  }
]

export function getAvatar(id: string): AvatarProfile | undefined {
  return CHARACTERS.find((avatar) => avatar.id === id)
}

/** Fallback appearance when an agent has no avatar assigned yet. */
export const DEFAULT_COWORKER: CharacterSpec = {
  name: 'Ada',
  role: 'Engineer',
  hairColor: '#2f2f35',
  hairHighlight: '#4a4a52',
  skinTone: '#efc39a',
  skinShadow: '#d7a476',
  shirtColor: '#4a9cc4',
  shirtShadow: '#36799c',
  pantsColor: '#3a4256',
  pantsShadow: '#2c3344',
  shoesColor: '#4a3a2b',
  outline: '#241d33',
  eyeColor: '#2a3345'
}