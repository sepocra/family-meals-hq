import type { ImportedRecipe } from './recipe-import'
import { parseImportedIngredientLines } from './recipe-import'

/** Extract Google Doc ID from share / edit / pub URLs, or a bare ID string. */
export function extractGoogleDocId(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null

  if (/^[a-zA-Z0-9_-]{20,}$/.test(trimmed) && !trimmed.includes('.')) {
    return trimmed
  }

  try {
    const url = new URL(trimmed)
    if (!url.hostname.includes('docs.google.com')) return null
    const match =
      url.pathname.match(/\/document\/d\/([a-zA-Z0-9_-]+)/) ??
      url.pathname.match(/\/document\/u\/\d+\/d\/([a-zA-Z0-9_-]+)/)
    return match?.[1] ?? null
  } catch {
    return null
  }
}

export function googleDocExportHtmlUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/export?format=html`
}

export function googleDocExportTxtUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/export?format=txt`
}

export function googleDocSourceUrl(docId: string): string {
  return `https://docs.google.com/document/d/${docId}/edit`
}

type DocBlock = { tag: 'h1' | 'h2' | 'p' | 'li'; text: string }

type RecipeBuilder = {
  title: string
  prep: number | null
  cook: number | null
  ingredientLines: string[]
  instructionLines: string[]
  section: null | 'ingredients' | 'method'
}

const INGREDIENT_HEADER = /^ingredients?(\s+list)?\s*:?\s*$/i
const METHOD_HEADER =
  /^(method|instructions?|directions?|steps|how to (make|cook)|cooking)\s*:?\s*$/i

function parseMinutes(line: string, label: 'prep' | 'cook'): number | null {
  const pattern =
    label === 'prep'
      ? /\bprep(?:\s*time)?\s*:?\s*(\d+)\s*(?:min(?:ute)?s?)?/i
      : /\bcook(?:\s*time)?\s*:?\s*(\d+)\s*(?:min(?:ute)?s?)?/i
  const m = line.match(pattern)
  return m ? parseInt(m[1], 10) : null
}

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&rsquo;/gi, "'")
    .replace(/&ldquo;/gi, '"')
    .replace(/&rdquo;/gi, '"')
}

function stripHtmlToText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/p>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\s+/g, ' ')
    .trim()
}

function htmlToBlocks(html: string): DocBlock[] {
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')

  const blocks: DocBlock[] = []
  const re = /<(h1|h2|p|li)[^>]*>([\s\S]*?)<\/\1>/gi
  let match: RegExpExecArray | null
  while ((match = re.exec(cleaned)) !== null) {
    const text = stripHtmlToText(match[2])
    if (text) {
      blocks.push({ tag: match[1].toLowerCase() as DocBlock['tag'], text })
    }
  }
  return blocks
}

function cleanLine(line: string): string {
  return line.replace(/^[\s•·▪▫◦‣⁃\-*–—\d]+[.)]?\s*/, '').trim()
}

function parseInstructionLines(lines: string[]): string {
  const steps: string[] = []
  for (const raw of lines) {
    const line = cleanLine(raw)
    if (line) steps.push(line)
  }
  if (steps.length === 0) return ''
  const numbered = steps.every((s) => /^\d+[.)]\s/.test(s))
  if (numbered) return steps.join('\n\n')
  return steps.map((s, i) => `${i + 1}. ${s}`).join('\n\n')
}

function classifyH2(text: string): 'ingredients' | 'method' | null {
  const t = text.trim()
  if (INGREDIENT_HEADER.test(t)) return 'ingredients'
  if (METHOD_HEADER.test(t)) return 'method'
  return null
}

function newBuilder(title: string): RecipeBuilder {
  return {
    title: title.trim(),
    prep: null,
    cook: null,
    ingredientLines: [],
    instructionLines: [],
    section: null,
  }
}

function finalizeBuilder(builder: RecipeBuilder, sourceUrl: string): ImportedRecipe | null {
  if (!builder.title) return null

  const ingredients = parseImportedIngredientLines(builder.ingredientLines)

  const instructions = parseInstructionLines(builder.instructionLines)
  if (ingredients.length === 0 && !instructions) return null

  return {
    name: builder.title,
    prep_minutes: builder.prep != null ? String(builder.prep) : '',
    cook_minutes: builder.cook != null ? String(builder.cook) : '',
    instructions,
    ingredients: ingredients.length > 0 ? ingredients : [{ name: '', quantity: '' }],
    source_url: sourceUrl,
  }
}

/** Parse multiple recipes: H1 = title, H2 = Ingredients or Method. */
export function parseRecipesFromGoogleDocHtml(
  html: string,
  sourceUrl: string
): ImportedRecipe[] {
  const blocks = htmlToBlocks(html)
  const hasH1 = blocks.some((b) => b.tag === 'h1')
  if (!hasH1) return []

  const recipes: ImportedRecipe[] = []
  let current: RecipeBuilder | null = null

  for (const block of blocks) {
    if (block.tag === 'h1') {
      if (current) {
        const recipe = finalizeBuilder(current, sourceUrl)
        if (recipe) recipes.push(recipe)
      }
      current = newBuilder(block.text)
      continue
    }

    if (!current) continue

    if (block.tag === 'h2') {
      const section = classifyH2(block.text)
      current.section = section
      continue
    }

    const prepM = parseMinutes(block.text, 'prep')
    const cookM = parseMinutes(block.text, 'cook')
    if (prepM != null) {
      current.prep = prepM
      continue
    }
    if (cookM != null) {
      current.cook = cookM
      continue
    }

    if (current.section === 'ingredients') {
      current.ingredientLines.push(block.text)
    } else if (current.section === 'method') {
      current.instructionLines.push(block.text)
    } else if (current.section === null) {
      const prepOnly = parseMinutes(block.text, 'prep')
      const cookOnly = parseMinutes(block.text, 'cook')
      if (prepOnly != null) current.prep = prepOnly
      else if (cookOnly != null) current.cook = cookOnly
    }
  }

  if (current) {
    const recipe = finalizeBuilder(current, sourceUrl)
    if (recipe) recipes.push(recipe)
  }

  return recipes
}

// ── Plain-text fallback (single recipe, no heading styles) ──

const INGREDIENT_HEADER_TXT =
  /^ingredients?(\s+list)?(\s*&\s*method)?\s*:?\s*$/i
const INSTRUCTION_HEADER_TXT =
  /^(instructions?|method|directions?|steps|how to (make|cook)|cooking)\s*:?\s*$/i

export function parseRecipeFromGoogleDocText(
  text: string,
  sourceUrl: string
): ImportedRecipe | null {
  const lines = text.replace(/\r\n/g, '\n').split('\n').map((l) => l.trimEnd())

  let prep: number | null = null
  let cook: number | null = null
  let title = ''
  const ingredientLines: string[] = []
  const instructionLines: string[] = []
  let section: 'header' | 'ingredients' | 'instructions' = 'header'

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) continue

    const prepM = parseMinutes(line, 'prep')
    const cookM = parseMinutes(line, 'cook')
    if (prepM != null) {
      prep = prepM
      continue
    }
    if (cookM != null) {
      cook = cookM
      continue
    }

    if (INGREDIENT_HEADER_TXT.test(line)) {
      section = 'ingredients'
      if (!title) title = 'Imported recipe'
      continue
    }
    if (INSTRUCTION_HEADER_TXT.test(line)) {
      section = 'instructions'
      continue
    }

    if (section === 'header') {
      if (!title) title = line
    } else if (section === 'ingredients') {
      ingredientLines.push(line)
    } else {
      instructionLines.push(line)
    }
  }

  const ingredients = parseImportedIngredientLines(ingredientLines)

  const instructions = parseInstructionLines(instructionLines)
  if (ingredients.length === 0 && !instructions) return null

  return {
    name: title || 'Imported recipe',
    prep_minutes: prep != null ? String(prep) : '',
    cook_minutes: cook != null ? String(cook) : '',
    instructions,
    ingredients: ingredients.length > 0 ? ingredients : [{ name: '', quantity: '' }],
    source_url: sourceUrl,
  }
}

export function parseRecipesFromGoogleDoc(
  html: string,
  text: string,
  sourceUrl: string
): ImportedRecipe[] {
  const fromHtml = parseRecipesFromGoogleDocHtml(html, sourceUrl)
  if (fromHtml.length > 0) return fromHtml

  const single = parseRecipeFromGoogleDocText(text, sourceUrl)
  return single ? [single] : []
}
