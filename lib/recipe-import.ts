export type ImportedRecipe = {
  name: string
  prep_minutes: string
  cook_minutes: string
  instructions: string
  ingredients: { name: string; quantity: string; lineText?: string }[]
  source_url: string
}

type JsonLd = Record<string, unknown>

function parseIsoDurationMinutes(iso: unknown): number | null {
  if (typeof iso !== 'string') return null
  const match = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/i)
  if (!match) return null
  const hours = parseInt(match[1] || '0', 10)
  const minutes = parseInt(match[2] || '0', 10)
  const seconds = parseInt(match[3] || '0', 10)
  return hours * 60 + minutes + Math.round(seconds / 60)
}

function cleanText(value: unknown): string {
  if (typeof value === 'string') return value.replace(/\s+/g, ' ').trim()
  return ''
}

/** Strip list markers only — keep leading quantities (1 tbsp, 2 can, etc.). */
export function cleanIngredientLine(line: string): string {
  return line.replace(/^[\s▢•·▪▫◦‣⁃\-*–—]+/, '').trim()
}

/** Serving / garnish / marinade lines — not shopped; skip on import. */
/** Subsection labels in ingredient lists (e.g. "CRUMB", "**Sauce**"). */
export function isIngredientSectionHeader(text: string): boolean {
  const t = cleanIngredientLine(text).replace(/^\*\*|\*\*$/g, '').trim()
  if (!t || t.length > 48 || /\d/.test(t)) return false
  return /^[A-Z][A-Z\s&/-]+$/.test(t)
}

export function isServingNoteIngredient(text: string): boolean {
  const t = cleanIngredientLine(text).toLowerCase()
  if (!t) return false
  if (
    /^(to\s+serve|for\s+serving|to\s+garnish|for\s+garnish(?:ing)?|garnish|to\s+top|to\s+cook|marinade|sauce)\s*:?\s*$/.test(
      t
    )
  ) {
    return true
  }
  return (
    /\bto\s+serve\b/.test(t) ||
    /\bto\s+cook\b/.test(t) ||
    /\bfor\s+serving\b/.test(t) ||
    /\bto\s+garnish\b/.test(t) ||
    /\bfor\s+garnish(?:ing)?\b/.test(t) ||
    /\bto\s+top\b/.test(t) ||
    /\bfor\s+topping\b/.test(t) ||
    /\bas\s+a\s+garnish\b/.test(t) ||
    /\bserve\s+with\b/.test(t) ||
    /\bfor\s+the\s+marinade\b/.test(t) ||
    /\bmarinade\b/.test(t)
  )
}

export function parseImportedIngredientLines(
  lines: string[]
): { name: string; quantity: string; lineText: string }[] {
  const rows: { name: string; quantity: string; lineText: string }[] = []
  for (const raw of lines) {
    const lineText = cleanIngredientLine(raw)
    if (!lineText || isIngredientSectionHeader(lineText) || isServingNoteIngredient(lineText)) continue
    const parsed = parseIngredientLine(raw)
    if (!parsed.name.trim() || isServingNoteIngredient(parsed.name)) continue
    rows.push({ ...parsed, lineText })
  }
  return rows
}

const FRACTIONS = '¼½¾⅓⅔⅛⅜⅝⅞'
const NUM = `[\\d${FRACTIONS}]+(?:[./][\\d${FRACTIONS}]+)?(?:\\s*[-–]\\s*[\\d${FRACTIONS}]+(?:[./][\\d${FRACTIONS}]+)?)?`

const METRIC_UNITS = 'kg|g|grams?|ml|l|litres?|liters?|oz|lb'
const MEASURE_UNITS =
  'cups?|tbsp|tsp|teaspoons?|tablespoons?|quarts?|handfuls?|cloves?|pinch(?:es)?'
const CONTAINER_UNITS = 'cans?|bottles?|bottle|packets?|packet|bunch(?:es)?'

export function parseIngredientLine(line: string): { name: string; quantity: string } {
  const text = cleanIngredientLine(line)
  if (!text) return { name: '', quantity: '' }

  // 1kg beef mince, 500g flour
  const metricAttached = text.match(
    new RegExp(`^(${NUM})\\s*(${METRIC_UNITS})\\s+(.+)$`, 'i')
  )
  if (metricAttached?.[3]?.trim()) {
    return {
      quantity: `${metricAttached[1].trim()} ${metricAttached[2]}`,
      name: metricAttached[3].trim(),
    }
  }

  // 1 tbsp oil, 2 can tomatoes, 3 tsp garlic
  const withMeasure = text.match(
    new RegExp(
      `^(${NUM})\\s+(${MEASURE_UNITS}|${CONTAINER_UNITS})\\s+(.+)$`,
      'i'
    )
  )
  if (withMeasure?.[3]?.trim()) {
    return {
      quantity: `${withMeasure[1].trim()} ${withMeasure[2]}`,
      name: withMeasure[3].trim(),
    }
  }

  // 1 brown onion, 2 dried bay leaves
  const counted = text.match(new RegExp(`^(${NUM})\\s+(.+)$`))
  if (counted?.[2]?.trim()) {
    return { quantity: counted[1].trim(), name: counted[2].trim() }
  }

  return { quantity: '', name: text }
}

function parseInstructions(value: unknown): string {
  if (typeof value === 'string') return value.trim()
  if (!Array.isArray(value)) return ''

  const steps: string[] = []
  for (const item of value) {
    if (typeof item === 'string') {
      const t = item.trim()
      if (t) steps.push(t)
      continue
    }
    if (item && typeof item === 'object') {
      const step = item as Record<string, unknown>
      const text = cleanText(step.text) || cleanText(step.name)
      if (text) steps.push(text)
    }
  }
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n\n')
}

/** JSON-LD recipeIngredient may be an array or an object with numeric keys (WordPress). */
export function recipeIngredientLines(value: unknown): string[] {
  if (Array.isArray(value)) {
    const lines: string[] = []
    for (const item of value) {
      if (typeof item === 'string') {
        lines.push(item)
        continue
      }
      if (item && typeof item === 'object') {
        const ing = item as Record<string, unknown>
        const name = cleanText(ing.name)
        const amount = cleanText(ing.amount) || cleanText(ing.quantity)
        if (name) lines.push(amount ? `${amount} ${name}`.trim() : name)
      }
    }
    return lines
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>
    const keys = Object.keys(obj).sort((a, b) => {
      const na = Number(a)
      const nb = Number(b)
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb
      return a.localeCompare(b)
    })
    return keys.map((k) => cleanText(obj[k])).filter(Boolean)
  }

  return []
}

function parseIngredients(value: unknown): { name: string; quantity: string; lineText?: string }[] {
  return parseImportedIngredientLines(recipeIngredientLines(value))
}

function isRecipeType(type: unknown): boolean {
  if (type === 'Recipe') return true
  if (Array.isArray(type)) return type.includes('Recipe')
  return false
}

function findRecipeNode(data: unknown): JsonLd | null {
  if (!data || typeof data !== 'object') return null

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeNode(item)
      if (found) return found
    }
    return null
  }

  const node = data as JsonLd
  if (isRecipeType(node['@type'])) return node

  const graph = node['@graph']
  if (graph) return findRecipeNode(graph)

  return null
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = []
  const pattern =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi

  let match: RegExpExecArray | null
  while ((match = pattern.exec(html)) !== null) {
    try {
      blocks.push(JSON.parse(match[1]))
    } catch {
      // skip invalid JSON-LD
    }
  }
  return blocks
}

export function parseRecipeFromHtml(html: string, sourceUrl: string): ImportedRecipe | null {
  for (const block of extractJsonLdBlocks(html)) {
    const recipe = findRecipeNode(block)
    if (!recipe) continue

    const name = cleanText(recipe.name) || cleanText(recipe.headline)
    if (!name) continue

    const ingredients = parseIngredients(recipe.recipeIngredient)
    const instructions = parseInstructions(recipe.recipeInstructions)
    const prep = parseIsoDurationMinutes(recipe.prepTime)
    const cook = parseIsoDurationMinutes(recipe.cookTime)

    return {
      name,
      prep_minutes: prep != null ? String(prep) : '',
      cook_minutes: cook != null ? String(cook) : '',
      instructions,
      ingredients: ingredients.length > 0 ? ingredients : [{ name: '', quantity: '' }],
      source_url: sourceUrl,
    }
  }

  return null
}

export function importedToFormFields(
  imported: ImportedRecipe
): Pick<
  ImportedRecipe,
  'name' | 'prep_minutes' | 'cook_minutes' | 'instructions' | 'ingredients' | 'source_url'
> {
  return {
    name: imported.name,
    prep_minutes: imported.prep_minutes,
    cook_minutes: imported.cook_minutes,
    instructions: imported.instructions,
    ingredients: imported.ingredients,
    source_url: imported.source_url,
  }
}

export function normalizeImportUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}
