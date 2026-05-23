/** Classify ingredients for shopping list / inventory columns. */

const MEAT_KEYWORDS = [
  'chicken',
  'beef',
  'pork',
  'lamb',
  'mutton',
  'veal',
  'bacon',
  'ham',
  'sausage',
  'mince',
  'steak',
  'turkey',
  'duck',
  'fish',
  'salmon',
  'tuna',
  'cod',
  'barramundi',
  'prawn',
  'prawns',
  'shrimp',
  'crab',
  'seafood',
  'prosciutto',
  'chorizo',
  'salami',
  'meat',
]

const MEAT_PHRASES = [
  'chicken breast',
  'chicken thigh',
  'ground beef',
  'pork chop',
  'lamb chop',
  'fish fillet',
]

export type InventoryCategory = 'produce' | 'meat'

export function isMeatIngredient(name: string): boolean {
  const normalized = name.toLowerCase().trim()
  if (!normalized) return false

  for (const phrase of MEAT_PHRASES) {
    if (normalized.includes(phrase)) return true
  }

  const words = normalized.split(/\s+/)
  return words.some((word) => MEAT_KEYWORDS.includes(word.replace(/[^a-z]/g, '')))
}

export function categoryForIngredientName(name: string): InventoryCategory {
  return isMeatIngredient(name) ? 'meat' : 'produce'
}
