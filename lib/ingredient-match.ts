import { normalizeProduceName } from './fresh-inventory'

/** Leading words stripped from comma-separated segments (e.g. "skinless chicken thighs"). */
const LEADING_DESCRIPTOR_WORDS = new Set([
  'boneless',
  'skinless',
  'bone-in',
  'bone',
  'precooked',
  'pre-cooked',
  'pre',
  'cooked',
  'raw',
  'frozen',
  'thawed',
  'shredded',
  'sliced',
  'diced',
  'chopped',
  'minced',
  'grated',
  'crushed',
  'ground',
  'peeled',
  'trimmed',
  'halved',
  'quartered',
  'whole',
  'large',
  'small',
  'medium',
  'fresh',
  'dried',
  'optional',
])

const UNIT_OR_PREP_WORDS = new Set([
  'cup',
  'cups',
  'tbsp',
  'tsp',
  'teaspoon',
  'teaspoons',
  'tablespoon',
  'tablespoons',
  'g',
  'kg',
  'ml',
  'l',
  'litre',
  'litres',
  'liter',
  'liters',
  'oz',
  'lb',
  'lbs',
  'clove',
  'cloves',
  'bunch',
  'can',
  'cans',
  'handful',
  'pinch',
  'optional',
  'large',
  'small',
  'medium',
  'fresh',
  'dried',
  'chopped',
  'diced',
  'sliced',
  'minced',
  'peeled',
  'grated',
  'crushed',
  'ground',
])

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function stripQuantityAndUnits(text: string): string {
  let s = text.toLowerCase().trim()
  s = s.replace(/^[\d¼½¾⅓⅔⅛⅜⅝⅞./\s]+/, '')
  s = s.replace(/^\d+\s*x\s*/i, '')
  s = s.replace(
    /^(?:(?:\d+[\d./\s]*)?\s*)?(?:cup|cups|tbsp|tsp|g|kg|ml|l|oz|lb|cloves?|bunch|cans?|handful|pinch)\s+/i,
    ''
  )
  return s.trim()
}

function stripLeadingDescriptors(text: string): string {
  let s = text.trim().toLowerCase()
  let changed = true
  while (changed && s) {
    changed = false
    for (const word of LEADING_DESCRIPTOR_WORDS) {
      const re = new RegExp(`^${escapeRegex(word)}\\s+`, 'i')
      if (re.test(s)) {
        s = s.replace(re, '').trim()
        changed = true
        break
      }
    }
  }
  return s
}

/**
 * True when two single-word names are the same ingredient (tomato/tomatoes).
 * Whole-word only — does not match prefixes (corn ≠ cornflour).
 */
export function ingredientNamesEquivalent(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!x || !y) return false
  if (x === y) return true

  const [shorter, longer] = x.length <= y.length ? [x, y] : [y, x]
  if (longer === `${shorter}s` || longer === `${shorter}es`) return true
  if (shorter.endsWith('y') && longer === `${shorter.slice(0, -1)}ies`) return true

  const vesFromSingular = shorter.endsWith('fe')
    ? `${shorter.slice(0, -2)}ves`
    : shorter.endsWith('f')
      ? `${shorter.slice(0, -1)}ves`
      : null
  if (vesFromSingular && longer === vesFromSingular) return true

  if (longer.endsWith('ves')) {
    const stem = longer.slice(0, -3)
    if (shorter === `${stem}f` || shorter === `${stem}fe`) return true
  }

  return false
}

/** Multi-word names with per-word singular/plural (chicken thigh ↔ chicken thighs). */
export function ingredientPhrasesEquivalent(a: string, b: string): boolean {
  const wordsA = a.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const wordsB = b.trim().toLowerCase().split(/\s+/).filter(Boolean)
  if (wordsA.length !== wordsB.length || wordsA.length === 0) return false
  return wordsA.every((word, i) => ingredientNamesEquivalent(word, wordsB[i]!))
}

/**
 * True when phrase appears as whole words in text (e.g. "chicken thigh" in
 * "boneless, skinless chicken thighs, precooked").
 */
export function recipeContainsPhrase(text: string, phrase: string): boolean {
  const phraseNorm = phrase.trim().toLowerCase()
  if (!phraseNorm) return false

  const words = phraseNorm.split(/\s+/).filter(Boolean)
  if (words.length === 0) return false

  const parts = words.map((word, i) => {
    const esc = escapeRegex(word)
    if (i !== words.length - 1) return esc
    if (word.endsWith('y') && word.length > 2) {
      const stem = escapeRegex(word.slice(0, -1))
      return `${stem}(?:y|ies)`
    }
    return `${esc}(?:s|es)?`
  })

  const normalizedText = text.trim().toLowerCase()
  if (new RegExp(`\\b${parts.join('\\s+')}\\b`, 'i').test(normalizedText)) return true

  for (const candidate of extractRecipeNameCandidates(normalizedText)) {
    if (ingredientPhrasesEquivalent(candidate, phraseNorm)) return true
  }

  return false
}

/** Core ingredient phrases from a recipe line (e.g. "carrots, chopped" → "carrots"). */
export function extractRecipeNameCandidates(recipeIngredient: string): string[] {
  const candidates = new Set<string>()
  const trimmed = recipeIngredient.trim()
  if (!trimmed) return []

  const stripped = stripQuantityAndUnits(trimmed)
  if (stripped) candidates.add(stripped)

  for (const segment of trimmed.split(',')) {
    let part = stripQuantityAndUnits(segment.trim())
    if (!part || UNIT_OR_PREP_WORDS.has(part)) continue
    candidates.add(part)
    const stripped = stripLeadingDescriptors(part)
    if (stripped && stripped !== part) candidates.add(stripped)
  }

  return [...candidates]
}

/** Best display name for a recipe ingredient line. */
export function primaryIngredientName(recipeIngredient: string): string | null {
  const candidates = extractRecipeNameCandidates(recipeIngredient)
  if (candidates.length > 0) return candidates[0]
  const stripped = stripQuantityAndUnits(recipeIngredient.trim())
  return stripped || null
}

/**
 * True when inventory and recipe refer to the same ingredient — whole-word / exact only.
 * "corn" does not match "cornflour"; "carrot" matches "carrots, chopped".
 */
export function ingredientsMatchExactly(
  inventoryItem: string,
  recipeIngredient: string
): boolean {
  const inventory = normalizeProduceName(inventoryItem)
  if (!inventory) return false

  const recipe = recipeIngredient.trim().toLowerCase()
  if (!recipe) return false

  const boundaryPattern = new RegExp(
    `(?:^|[\\s,;()\\[\\]—–-])${escapeRegex(inventory)}(?:$|[\\s,;()\\[\\]—–-])`,
    'i'
  )
  if (boundaryPattern.test(recipe)) return true

  for (const candidate of extractRecipeNameCandidates(recipeIngredient)) {
    if (
      ingredientNamesEquivalent(inventory, candidate) ||
      ingredientPhrasesEquivalent(inventory, candidate)
    ) {
      return true
    }

    if (candidate.includes(' ')) {
      const phraseBoundary = new RegExp(
        `(?:^|[\\s,;()\\[\\]—–-])${escapeRegex(candidate)}(?:$|[\\s,;()\\[\\]—–-])`,
        'i'
      )
      if (phraseBoundary.test(inventory)) return true
    }
  }

  return false
}
