'use client'
import { useEffect, useState, type ReactNode } from 'react'
import {
  importedToFormFields,
  normalizeImportUrl,
  type ImportedRecipe,
} from '../../lib/recipe-import'
import {
  classifyIngredientLine,
  classifyIngredientRows,
  createIngredientInBank,
  fetchIngredientCatalog,
  INGREDIENT_BANK_CATEGORIES,
  suggestIngredientBankName,
  type CatalogIngredient,
  type IngredientBankCategory,
} from '../../lib/ingredient-catalog'
import {
  createIngredientRequest,
  fetchPendingIngredientRequestNames,
  normalizeRequestName,
} from '../../lib/ingredient-requests'
import { useAuth } from '../../components/AuthProvider'
import { isMeatIngredient } from '../../lib/ingredient-category'
import { shortenRecipeUrl } from '../../lib/recipe-url'
import { supabase } from '../../lib/supabase'

type RecipeIngredient = {
  quantity: string
  display_name: string | null
  ingredients: {
    name: string
    pantry_type: string | null
    category: string | null
  } | null
}

type Recipe = {
  id: string
  name: string
  effort_level: string
  prep_minutes: number | null
  cook_minutes: number | null
  instructions: string | null
  dietary_tags: string[]
  source_url: string | null
  created_at?: string | null
  recipe_ingredients: RecipeIngredient[]
}

/** Raw shape from Supabase embeds (ingredients may be object or array). */
type RecipeRow = {
  id: string
  name: string
  effort_level: string
  prep_minutes: number | null
  cook_minutes: number | null
  instructions: string | null
  dietary_tags: string[]
  source_url: string | null
  created_at?: string | null
  recipe_ingredients?: {
    quantity: string
    display_name?: string | null
    ingredients:
      | {
          name: string
          pantry_type: string | null
          category: string | null
        }
      | {
          name: string
          pantry_type: string | null
          category: string | null
        }[]
      | null
  }[]
}

const RECIPE_LIST_SELECT = `
  id,
  name,
  effort_level,
  prep_minutes,
  cook_minutes,
  instructions,
  dietary_tags,
  source_url,
  created_at
`

function sortRecipesByCreatedAt(recipes: Recipe[]): Recipe[] {
  return [...recipes].sort((a, b) => {
    const ta = a.created_at ?? ''
    const tb = b.created_at ?? ''
    if (ta !== tb) return ta.localeCompare(tb)
    return a.name.localeCompare(b.name)
  })
}

function isDisplayNameSchemaError(error: { message?: string } | null): boolean {
  const msg = error?.message ?? ''
  return (
    msg.includes('display_name') &&
    (msg.includes('schema cache') || msg.includes('Could not find'))
  )
}

const RECIPE_WITH_INGREDIENTS_SELECT = `
  ${RECIPE_LIST_SELECT},
  recipe_ingredients (
    quantity,
    display_name,
    ingredients (
      name,
      pantry_type,
      category
    )
  )
`

const RECIPE_WITH_INGREDIENTS_SELECT_LEGACY = `
  ${RECIPE_LIST_SELECT},
  recipe_ingredients (
    quantity,
    ingredients (
      name,
      pantry_type,
      category
    )
  )
`

function normalizeRecipes(rows: RecipeRow[]): Recipe[] {
  return rows.map((recipe) => ({
    ...recipe,
    recipe_ingredients: (recipe.recipe_ingredients ?? []).map((ri) => ({
      quantity: ri.quantity,
      display_name: ri.display_name ?? null,
      ingredients: Array.isArray(ri.ingredients)
        ? (ri.ingredients[0] ?? null)
        : ri.ingredients,
    })),
  }))
}

/** DB check constraint allows: low | medium | high */
const EFFORT_LEVELS = ['low', 'medium', 'high'] as const
type EffortLevel = (typeof EFFORT_LEVELS)[number]

const EFFORT_LABELS: Record<EffortLevel, string> = {
  low: 'Easy',
  medium: 'Medium',
  high: 'Hard',
}

function normalizeEffortLevel(level: string | null | undefined): EffortLevel {
  const key = (level ?? '').toLowerCase()
  if (key === 'low' || key === 'medium' || key === 'high') return key
  if (key === 'easy') return 'low'
  if (key === 'hard') return 'high'
  return 'medium'
}

function effortLabel(level: string): string {
  const normalized = normalizeEffortLevel(level)
  return EFFORT_LABELS[normalized]
}

const DIETARY_TAGS = ['Dairy-free', 'Peanut-free', 'Baby-friendly', 'Toddler-friendly']

const effortBadgeClass: Record<string, string> = {
  low:    'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  medium: 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300',
  high:   'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
}

const inputClass =
  'border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 outline-none focus:border-gray-400 dark:focus:border-gray-500'

type IngredientRow = {
  name: string
  quantity: string
  /** Original import line (Google Doc / URL); used for display_name on save. */
  importLineText: string | null
  isPantry: boolean
  catalogId: string | null
  catalogName: string | null
  matchError: string | null
  bankRequestPending?: boolean
}

type RecipeFormState = {
  name: string
  effort_level: string
  prep_minutes: string
  cook_minutes: string
  instructions: string
  dietary_tags: string[]
  source_url: string
  ingredients: IngredientRow[]
}

const emptyForm: RecipeFormState = {
  name: '',
  effort_level: 'low',
  prep_minutes: '',
  cook_minutes: '',
  instructions: '',
  dietary_tags: [],
  source_url: '',
  ingredients: [
    { name: '', quantity: '', importLineText: null, isPantry: false, catalogId: null, catalogName: null, matchError: null },
    { name: '', quantity: '', importLineText: null, isPantry: false, catalogId: null, catalogName: null, matchError: null },
    { name: '', quantity: '', importLineText: null, isPantry: false, catalogId: null, catalogName: null, matchError: null },
  ],
}

function recipeToForm(recipe: Recipe, catalog: CatalogIngredient[]): RecipeFormState {
  const rows = recipe.recipe_ingredients.map((ri) => {
    const savedDisplay = ri.display_name?.trim() || ''
    return {
      name: savedDisplay || ri.ingredients?.name || '',
      quantity: ri.quantity ?? '',
      lineText: savedDisplay || undefined,
    }
  })
  const ingredients = classifyIngredientRows(
    rows.filter((r) => r.name.trim()),
    catalog
  )
  return {
    name: recipe.name,
    effort_level: normalizeEffortLevel(recipe.effort_level),
    prep_minutes: recipe.prep_minutes?.toString() ?? '',
    cook_minutes: recipe.cook_minutes?.toString() ?? '',
    instructions: recipe.instructions ?? '',
    dietary_tags: recipe.dietary_tags ?? [],
    source_url: recipe.source_url ?? '',
    ingredients:
      ingredients.length > 0
        ? ingredients
        : [{ name: '', quantity: '', importLineText: null, isPantry: false, catalogId: null, catalogName: null, matchError: null }],
  }
}

type RecipeFormPanelProps = {
  title: string
  saveLabel: string
  form: RecipeFormState
  formError: string | null
  saving: boolean
  deleting?: boolean
  onNameChange: (value: string) => void
  onEffortChange: (level: string) => void
  onPrepChange: (value: string) => void
  onCookChange: (value: string) => void
  onInstructionsChange: (value: string) => void
  onToggleTag: (tag: string) => void
  onUpdateIngredient: (index: number, field: 'name' | 'quantity', value: string) => void
  onAddFreshIngredientRow: () => void
  onAddPantryIngredientRow: () => void
  onRemoveIngredientRow: (index: number) => void
  onToggleIngredientPantry: (index: number) => void
  onReclassifyIngredient: (index: number) => void
  onAddToIngredientBank: (
    index: number,
    bankName: string,
    category: IngredientBankCategory
  ) => Promise<string | null>
  onRequestIngredient: (
    index: number,
    bankName: string,
    category: IngredientBankCategory
  ) => Promise<string | null>
  isAdmin: boolean
  onSave: () => void
  onCancel: () => void
  onDelete?: () => void
}

function SwapListsIcon() {
  return (
    <svg
      width="24"
      height="16"
      viewBox="0 0 24 16"
      fill="currentColor"
      aria-hidden
      className="block"
    >
      {/* Top arrow → */}
      <rect x="5" y="4" width="9" height="2.5" />
      <path d="M14 2.5 L19.5 5.25 L14 8 Z" />
      {/* Bottom arrow ← */}
      <rect x="10" y="9.5" width="9" height="2.5" />
      <path d="M10 7.5 L4.5 10.25 L10 13 Z" />
    </svg>
  )
}

function defaultBankCategory(
  bankName: string,
  rowIsPantry: boolean
): IngredientBankCategory {
  if (rowIsPantry) return 'pantry'
  if (isMeatIngredient(bankName)) return 'meat'
  return 'fresh'
}

function RequestIngredientPanel({
  row,
  index,
  onRequest,
}: {
  row: IngredientRow
  index: number
  onRequest: (
    index: number,
    bankName: string,
    category: IngredientBankCategory
  ) => Promise<string | null>
}) {
  const recipeLine = row.importLineText?.trim() || row.name.trim()
  const [bankName, setBankName] = useState(() => suggestIngredientBankName(recipeLine))
  const [category, setCategory] = useState<IngredientBankCategory>(() =>
    defaultBankCategory(suggestIngredientBankName(recipeLine), row.isPantry)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const suggested = suggestIngredientBankName(recipeLine)
    setBankName(suggested)
    setCategory(defaultBankCategory(suggested, row.isPantry))
    setError(null)
  }, [recipeLine, row.isPantry])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const err = await onRequest(index, bankName, category)
    setSaving(false)
    if (err) setError(err)
  }

  if (row.bankRequestPending) {
    return (
      <p className="ml-9 mt-1 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-3 py-2">
        Request sent — waiting for admin to add &ldquo;{bankName || suggestIngredientBankName(recipeLine)}&rdquo; to the ingredient bank.
      </p>
    )
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="ml-9 mt-1 flex flex-col gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3"
    >
      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
        Request admin to add to ingredient bank
      </p>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Name</label>
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. chicken thigh"
            className={inputClass}
          />
        </div>
        <div className="sm:w-36 shrink-0 flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Category</label>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as IngredientBankCategory)
            }
            className={inputClass}
          >
            {INGREDIENT_BANK_CATEGORIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={saving || !bankName.trim()}
        className="self-start text-sm font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-lg px-3 py-1.5 hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Sending…' : 'Request admin to add'}
      </button>
    </form>
  )
}

function AddToIngredientBankPanel({
  row,
  index,
  onAdd,
}: {
  row: IngredientRow
  index: number
  onAdd: (
    index: number,
    bankName: string,
    category: IngredientBankCategory
  ) => Promise<string | null>
}) {
  const recipeLine = row.importLineText?.trim() || row.name.trim()
  const [bankName, setBankName] = useState(() => suggestIngredientBankName(recipeLine))
  const [category, setCategory] = useState<IngredientBankCategory>(() =>
    defaultBankCategory(suggestIngredientBankName(recipeLine), row.isPantry)
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const suggested = suggestIngredientBankName(recipeLine)
    setBankName(suggested)
    setCategory(defaultBankCategory(suggested, row.isPantry))
    setError(null)
  }, [recipeLine, row.isPantry])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setSaving(true)
    const err = await onAdd(index, bankName, category)
    setSaving(false)
    if (err) setError(err)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="ml-9 mt-1 flex flex-col gap-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 p-3"
    >
      <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
        Add to ingredient bank
      </p>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Name</label>
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. chicken thigh"
            className={inputClass}
          />
        </div>
        <div className="sm:w-36 shrink-0 flex flex-col gap-1">
          <label className="text-xs text-gray-500 dark:text-gray-400">Category</label>
          <select
            value={category}
            onChange={(e) =>
              setCategory(e.target.value as IngredientBankCategory)
            }
            className={inputClass}
          >
            {INGREDIENT_BANK_CATEGORIES.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      {error && <p className="text-xs text-red-500">{error}</p>}
      <button
        type="submit"
        disabled={saving || !bankName.trim()}
        className="self-start text-sm font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-lg px-3 py-1.5 hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
      >
        {saving ? 'Adding…' : 'Add to bank & match'}
      </button>
    </form>
  )
}

function IngredientSwapButton({
  isPantry,
  onToggle,
}: {
  isPantry: boolean
  onToggle: () => void
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="shrink-0 p-2 rounded-lg text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      aria-label={isPantry ? 'Move to fresh list' : 'Move to pantry list'}
      title={isPantry ? 'Move to fresh' : 'Move to pantry'}
    >
      <SwapListsIcon />
    </button>
  )
}

function IngredientListSections({
  ingredients,
  totalRows,
  onUpdateIngredient,
  onRemoveIngredientRow,
  onToggleIngredientPantry,
  onReclassifyIngredient,
  onAddToIngredientBank,
  onRequestIngredient,
  isAdmin,
  onAddFreshIngredientRow,
  onAddPantryIngredientRow,
}: {
  ingredients: IngredientRow[]
  totalRows: number
  onUpdateIngredient: (index: number, field: 'name' | 'quantity', value: string) => void
  onRemoveIngredientRow: (index: number) => void
  onToggleIngredientPantry: (index: number) => void
  onReclassifyIngredient: (index: number) => void
  onAddToIngredientBank: (
    index: number,
    bankName: string,
    category: IngredientBankCategory
  ) => Promise<string | null>
  onRequestIngredient: (
    index: number,
    bankName: string,
    category: IngredientBankCategory
  ) => Promise<string | null>
  isAdmin: boolean
  onAddFreshIngredientRow: () => void
  onAddPantryIngredientRow: () => void
}) {
  function renderSection(
    isPantry: boolean,
    title: string,
    hint: string,
    addLabel: string,
    onAddRow: () => void
  ) {
    const rows = ingredients
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => row.isPantry === isPantry)

    return (
      <div className="flex flex-col gap-2">
        <div>
          <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">
            {title}
          </label>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{hint}</p>
        </div>
        <div className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <p className="text-sm text-gray-400 dark:text-gray-500 italic">None yet</p>
          ) : (
            rows.map(({ row, index }) => (
              <div key={`${isPantry}-${index}`} className="flex flex-col gap-1">
                <div className="flex gap-2 items-center">
                  <IngredientSwapButton
                    isPantry={row.isPantry}
                    onToggle={() => onToggleIngredientPantry(index)}
                  />
                  <input
                    type="text"
                    value={row.name}
                    onChange={(e) => onUpdateIngredient(index, 'name', e.target.value)}
                    onBlur={() => onReclassifyIngredient(index)}
                    placeholder="Ingredient"
                    className={`flex-1 min-w-0 ${inputClass} ${row.matchError ? 'border-red-400 dark:border-red-500' : ''}`}
                  />
                  <input
                    type="text"
                    value={row.quantity}
                    onChange={(e) => onUpdateIngredient(index, 'quantity', e.target.value)}
                    placeholder="Qty e.g. 500g"
                    className={`w-28 shrink-0 ${inputClass}`}
                  />
                  {totalRows > 1 && (
                    <button
                      type="button"
                      onClick={() => onRemoveIngredientRow(index)}
                      className="shrink-0 text-gray-300 dark:text-gray-600 hover:text-red-400 text-lg leading-none"
                      aria-label="Remove ingredient"
                    >
                      ×
                    </button>
                  )}
                </div>
                {row.matchError && (
                  <>
                    <p className="text-xs text-red-500 pl-9">{row.matchError}</p>
                    {isAdmin ? (
                      <AddToIngredientBankPanel
                        row={row}
                        index={index}
                        onAdd={onAddToIngredientBank}
                      />
                    ) : (
                      <RequestIngredientPanel
                        row={row}
                        index={index}
                        onRequest={onRequestIngredient}
                      />
                    )}
                  </>
                )}
                {row.catalogId && !row.matchError && row.catalogName && (
                  <p className="text-xs text-gray-400 dark:text-gray-500 pl-9 truncate">
                    Matched: {row.catalogName}
                  </p>
                )}
              </div>
            ))
          )}
        </div>
        <button
          type="button"
          onClick={onAddRow}
          className="text-sm text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300 text-left"
        >
          {addLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {renderSection(
        false,
        'Fresh (fruit, veg & meat)',
        'Must match an ingredient in Supabase (name contained in recipe line, or an approved multiple).',
        '+ Add fresh ingredient',
        onAddFreshIngredientRow
      )}
      {renderSection(
        true,
        'Pantry staples',
        'Oils, spices, pasta, etc. — assumed on hand; not on the shopping list.',
        '+ Add pantry staple',
        onAddPantryIngredientRow
      )}
    </div>
  )
}

function RecipeFormPanel({
  title,
  saveLabel,
  form,
  formError,
  saving,
  deleting = false,
  onNameChange,
  onEffortChange,
  onPrepChange,
  onCookChange,
  onInstructionsChange,
  onToggleTag,
  onUpdateIngredient,
  onAddFreshIngredientRow,
  onAddPantryIngredientRow,
  onRemoveIngredientRow,
  onToggleIngredientPantry,
  onReclassifyIngredient,
  onAddToIngredientBank,
  onRequestIngredient,
  isAdmin,
  onSave,
  onCancel,
  onDelete,
}: RecipeFormPanelProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Spaghetti bolognese"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Effort level</label>
        <div className="flex gap-2">
          {EFFORT_LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => onEffortChange(level)}
              className={`text-sm px-4 py-1.5 rounded-full border transition-colors ${
                form.effort_level === level
                  ? 'bg-gray-900 text-white border-gray-900 dark:bg-gray-100 dark:text-gray-900 dark:border-gray-100'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              {EFFORT_LABELS[level]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-4">
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Prep (mins)</label>
          <input
            type="number"
            value={form.prep_minutes}
            onChange={(e) => onPrepChange(e.target.value)}
            placeholder="15"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1">
          <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Cook (mins)</label>
          <input
            type="number"
            value={form.cook_minutes}
            onChange={(e) => onCookChange(e.target.value)}
            placeholder="30"
            className={inputClass}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Dietary tags</label>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                form.dietary_tags.includes(tag)
                  ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800'
                  : 'border-gray-200 dark:border-gray-600 text-gray-600 dark:text-gray-300 hover:border-gray-400 dark:hover:border-gray-500'
              }`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <IngredientListSections
        ingredients={form.ingredients}
        totalRows={form.ingredients.length}
        onUpdateIngredient={onUpdateIngredient}
        onRemoveIngredientRow={onRemoveIngredientRow}
        onToggleIngredientPantry={onToggleIngredientPantry}
        onReclassifyIngredient={onReclassifyIngredient}
        onAddToIngredientBank={onAddToIngredientBank}
        onRequestIngredient={onRequestIngredient}
        isAdmin={isAdmin}
        onAddFreshIngredientRow={onAddFreshIngredientRow}
        onAddPantryIngredientRow={onAddPantryIngredientRow}
      />

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wide">Instructions</label>
        <textarea
          value={form.instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          placeholder="Step by step method..."
          rows={4}
          className={`${inputClass} resize-none`}
        />
      </div>

      {formError && <p className="text-red-500 text-sm">{formError}</p>}

      <div className={`flex gap-3 ${onDelete ? 'justify-between' : ''}`}>
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving || deleting}
            className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Deleting...' : 'Delete recipe'}
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || deleting}
          className={`bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors ${onDelete ? '' : 'w-full'}`}
        >
          {saving ? 'Saving...' : saveLabel}
        </button>
      </div>
    </div>
  )
}

function EditIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
      <path d="m2.695 14.363 1.092-3.81a1 1 0 0 1 .257-.365l8.607-8.607a1 1 0 0 1 1.414 0l2.829 2.829a1 1 0 0 1 0 1.414l-8.607 8.607a1 1 0 0 1-.365.257l-3.81 1.092a.5.5 0 0 1-.612-.612ZM12.146 4.854 15.146 7.854 16.439 6.561 13.439 3.561 12.146 4.854Z" />
    </svg>
  )
}

type DeleteConfirmDialogProps = {
  title: string
  error: string | null
  deleting: boolean
  onConfirm: () => void
  onCancel: () => void
  children: ReactNode
  confirmLabel?: string
}

function DeleteConfirmDialog({
  title,
  error,
  deleting,
  onConfirm,
  onCancel,
  children,
  confirmLabel = 'Delete',
}: DeleteConfirmDialogProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-dialog-title"
    >
      <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 max-w-sm w-full flex flex-col gap-4 shadow-lg">
        <h2 id="delete-dialog-title" className="text-base font-semibold text-gray-900 dark:text-gray-100">
          {title}
        </h2>
        <div className="text-sm text-gray-600 dark:text-gray-300">{children}</div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-50 transition-colors"
          >
            Keep recipe
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={deleting}
            className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? 'Deleting...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default function Home() {
  const [recipes, setRecipes] = useState<Recipe[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<RecipeFormState>(emptyForm)
  const [showAddChooser, setShowAddChooser] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importMode, setImportMode] = useState<'website' | 'google-doc'>('website')
  const [importInput, setImportInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingImports, setPendingImports] = useState<ImportedRecipe[] | null>(null)
  const [editingPendingImportIndex, setEditingPendingImportIndex] = useState<number | null>(
    null
  )
  const [docImportCandidates, setDocImportCandidates] = useState<ImportedRecipe[] | null>(
    null
  )
  const [selectedDocImportNames, setSelectedDocImportNames] = useState<Set<string>>(
    () => new Set()
  )
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [ingredientCatalog, setIngredientCatalog] = useState<CatalogIngredient[]>([])
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [supportsRecipeDisplayName, setSupportsRecipeDisplayName] = useState(true)
  const [pendingRequestNames, setPendingRequestNames] = useState<Set<string>>(
    () => new Set()
  )
  const { isAdmin, loading: authLoading } = useAuth()

  useEffect(() => {
    if (authLoading || isAdmin) return
    fetchPendingIngredientRequestNames(supabase)
      .then(setPendingRequestNames)
      .catch((err) => console.error(err))
  }, [authLoading, isAdmin])

  useEffect(() => {
    function refreshCatalogAndRequests() {
      fetchIngredientCatalog(supabase)
        .then(setIngredientCatalog)
        .catch((err) => console.error(err))
      if (!isAdmin) {
        fetchPendingIngredientRequestNames(supabase)
          .then(setPendingRequestNames)
          .catch((err) => console.error(err))
      }
    }
    window.addEventListener('focus', refreshCatalogAndRequests)
    return () => window.removeEventListener('focus', refreshCatalogAndRequests)
  }, [isAdmin])

  function applyPendingRequestFlags(rows: IngredientRow[]): IngredientRow[] {
    if (authLoading || isAdmin || pendingRequestNames.size === 0) return rows
    return rows.map((row) => {
      if (!row.matchError) return { ...row, bankRequestPending: false }
      const suggested = normalizeRequestName(
        suggestIngredientBankName(row.importLineText?.trim() || row.name)
      )
      return {
        ...row,
        bankRequestPending: pendingRequestNames.has(suggested),
      }
    })
  }

  useEffect(() => {
    loadRecipes()
    fetchIngredientCatalog(supabase)
      .then(setIngredientCatalog)
      .catch((err) => console.error(err))
      .finally(() => setCatalogLoading(false))

    supabase
      .from('recipe_ingredients')
      .select('display_name')
      .limit(0)
      .then(({ error }) => {
        if (isDisplayNameSchemaError(error)) setSupportsRecipeDisplayName(false)
      })
  }, [])

  async function loadRecipes() {
    const { data, error } = await supabase
      .from('recipes')
      .select(RECIPE_LIST_SELECT)
      .order('created_at', { ascending: true })
    if (error) {
      console.error(error)
    } else {
      setRecipes(sortRecipesByCreatedAt(normalizeRecipes(data ?? [])))
    }
    setLoading(false)
  }

  function toggleTag(tag: string) {
    setForm(f => ({
      ...f,
      dietary_tags: f.dietary_tags.includes(tag)
        ? f.dietary_tags.filter(t => t !== tag)
        : [...f.dietary_tags, tag],
    }))
  }

  function resetImport(clearPending = true) {
    setShowImport(false)
    setImportInput('')
    setImportError(null)
    setImporting(false)
    if (clearPending) {
      setPendingImports(null)
      setDocImportCandidates(null)
      setSelectedDocImportNames(new Set())
      setEditingPendingImportIndex(null)
      setBatchError(null)
    }
  }

  function cancelPendingImportEdit() {
    setShowForm(false)
    setEditingPendingImportIndex(null)
    setForm(emptyForm)
    setFormError(null)
  }

  function toggleDocImportSelection(name: string) {
    setSelectedDocImportNames((prev) => {
      const next = new Set(prev)
      if (next.has(name)) next.delete(name)
      else next.add(name)
      return next
    })
  }

  function selectAllDocImports() {
    if (!docImportCandidates) return
    setSelectedDocImportNames(new Set(docImportCandidates.map((r) => r.name)))
  }

  function selectNoDocImports() {
    setSelectedDocImportNames(new Set())
  }

  function confirmDocImportSelection() {
    if (!docImportCandidates?.length) return
    const selected = docImportCandidates.filter((r) =>
      selectedDocImportNames.has(r.name)
    )
    if (selected.length === 0) {
      setImportError('Select at least one recipe to import.')
      return
    }
    setImportError(null)
    setPendingImports(selected)
    setDocImportCandidates(null)
    setSelectedDocImportNames(new Set())
  }

  function importedToFormState(imported: ImportedRecipe): RecipeFormState {
    const fields = importedToFormFields(imported)
    const hasIngredients = fields.ingredients.some((i) => i.name.trim())
    const classified = hasIngredients
      ? applyPendingRequestFlags(
          classifyIngredientRows(
            fields.ingredients.filter((i) => i.name.trim()),
            ingredientCatalog
          )
        )
      : emptyForm.ingredients
    return {
      ...emptyForm,
      ...fields,
      ingredients: hasIngredients ? classified : emptyForm.ingredients,
    }
  }

  function reclassifyIngredientAt(index: number) {
    setForm((f) => {
      const row = f.ingredients[index]
      if (!row) return f
      const matchText = row.importLineText?.trim() || row.name
      const classified = classifyIngredientLine(matchText, ingredientCatalog)
      const updated = [...f.ingredients]
      updated[index] = {
        ...row,
        isPantry: classified.isPantry,
        catalogId: classified.catalogId,
        catalogName: classified.catalogName,
        matchError: classified.matchError,
      }
      return { ...f, ingredients: applyPendingRequestFlags(updated) }
    })
  }

  async function handleAddToIngredientBank(
    index: number,
    bankName: string,
    category: IngredientBankCategory
  ): Promise<string | null> {
    const result = await createIngredientInBank(supabase, bankName, category)
    if ('error' in result) return result.error

    const catalog = [...ingredientCatalog, result.ingredient].sort((a, b) =>
      a.name.localeCompare(b.name)
    )
    setIngredientCatalog(catalog)

    setForm((f) => {
      const row = f.ingredients[index]
      if (!row) return f
      const matchText = row.importLineText?.trim() || row.name
      const classified = classifyIngredientLine(matchText, catalog)
      const updated = [...f.ingredients]
      updated[index] = {
        ...row,
        isPantry: classified.isPantry,
        catalogId: classified.catalogId,
        catalogName: classified.catalogName,
        matchError: classified.matchError,
      }
      return { ...f, ingredients: applyPendingRequestFlags(updated) }
    })

    return null
  }

  async function handleRequestIngredient(
    index: number,
    bankName: string,
    category: IngredientBankCategory
  ): Promise<string | null> {
    const row = form.ingredients[index]
    const recipeLine = row?.importLineText?.trim() || row?.name?.trim() || ''
    const result = await createIngredientRequest(
      supabase,
      bankName,
      category,
      recipeLine || null
    )
    if ('error' in result) return result.error

    const norm = normalizeRequestName(bankName)
    setPendingRequestNames((prev) => new Set(prev).add(norm))
    setForm((f) => {
      const updated = [...f.ingredients]
      const current = updated[index]
      if (!current) return f
      updated[index] = { ...current, bankRequestPending: true }
      return { ...f, ingredients: updated }
    })
    return null
  }

  function validateAllIngredients(): string | null {
    const waiting = form.ingredients.filter(
      (row) => row.name.trim() && row.bankRequestPending
    )
    if (waiting.length > 0) {
      const names = waiting
        .map((r) => suggestIngredientBankName(r.importLineText?.trim() || r.name))
        .slice(0, 3)
        .join(', ')
      const more = waiting.length > 3 ? ` and ${waiting.length - 3} more` : ''
      return `Waiting for admin to add to ingredient bank: ${names}${more}.`
    }
    const missing = form.ingredients.filter(
      (row) => row.name.trim() && (row.matchError || !row.catalogId)
    )
    if (missing.length === 0) return null
    const names = missing.map((r) => r.name.trim()).slice(0, 3).join(', ')
    const more = missing.length > 3 ? ` and ${missing.length - 3} more` : ''
    return isAdmin
      ? `Add missing ingredients to the bank first: ${names}${more}.`
      : `Request admin to add missing ingredients: ${names}${more}.`
  }

  function openAddChooser() {
    resetImport(true)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setShowForm(false)
    setShowAddChooser(true)
  }

  function selectAddManual() {
    setShowAddChooser(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setShowForm(true)
  }

  function selectAddImport(mode: 'website' | 'google-doc') {
    setShowAddChooser(false)
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setImportMode(mode)
    setShowImport(true)
    setImportError(null)
    setImportInput('')
  }

  function backToAddChooser() {
    if (editingPendingImportIndex !== null) {
      cancelPendingImportEdit()
      return
    }
    resetImport(false)
    setShowForm(false)
    setShowImport(false)
    setForm(emptyForm)
    setFormError(null)
    setShowAddChooser(true)
  }

  async function openEditForm(recipe: Recipe) {
    setFormError(null)

    const { data, error } = await supabase
      .from('recipes')
      .select(
        supportsRecipeDisplayName
          ? RECIPE_WITH_INGREDIENTS_SELECT
          : RECIPE_WITH_INGREDIENTS_SELECT_LEGACY
      )
      .eq('id', recipe.id)
      .single()

    if (error || !data) {
      setFormError(error?.message ?? 'Could not load recipe for editing.')
      return
    }

    setShowForm(false)
    setEditingId(recipe.id)
    const nextForm = recipeToForm(normalizeRecipes([data])[0], ingredientCatalog)
    setForm({
      ...nextForm,
      ingredients: applyPendingRequestFlags(nextForm.ingredients),
    })
  }

  function cancelForm() {
    if (editingPendingImportIndex !== null) {
      cancelPendingImportEdit()
      return
    }
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
    setDeleting(false)
    setShowDeleteConfirm(false)
    setShowAddChooser(false)
    resetImport()
  }

  const isAddingRecipe =
    showAddChooser ||
    showImport ||
    (showForm && !editingId) ||
    (pendingImports != null && pendingImports.length > 0) ||
    (docImportCandidates != null && docImportCandidates.length > 0)

  async function handleImport() {
    setImportError(null)
    if (!importInput.trim()) {
      setImportError(
        importMode === 'google-doc'
          ? 'Paste a Google Docs link.'
          : 'Paste a recipe URL.'
      )
      return
    }

    setImporting(true)
    try {
      const endpoint =
        importMode === 'google-doc'
          ? '/api/recipes/import/google-docs'
          : '/api/recipes/import'

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data.error ?? 'Import failed.')
        return
      }

      if (importMode === 'google-doc') {
        const recipes: ImportedRecipe[] = Array.isArray(data.recipes)
          ? data.recipes
          : data.recipe
            ? [data.recipe]
            : []

        if (recipes.length === 0) {
          setImportError('No recipes found in document.')
          return
        }

        if (recipes.length === 1) {
          setEditingId(null)
          setForm(importedToFormState(recipes[0]))
          resetImport()
          setShowForm(true)
          setFormError(null)
          return
        }

        setDocImportCandidates(recipes)
        setSelectedDocImportNames(new Set(recipes.map((r) => r.name)))
        setImportError(null)
        resetImport(false)
        return
      }

      const sourceUrl =
        importedToFormFields(data.recipe).source_url ||
        normalizeImportUrl(importInput.trim()) ||
        ''
      setEditingId(null)
      setForm({
        ...importedToFormState(data.recipe),
        source_url: sourceUrl,
      })
      resetImport()
      setShowForm(true)
      setFormError(null)
    } catch {
      setImportError('Could not reach the server. Try again.')
    } finally {
      setImporting(false)
    }
  }

  function updateIngredient(
    index: number,
    field: 'name' | 'quantity',
    value: string
  ) {
    setForm(f => {
      const updated = [...f.ingredients]
      const row = { ...updated[index], [field]: value }
      if (field === 'name' && row.importLineText) {
        row.importLineText = null
      }
      updated[index] = row
      return { ...f, ingredients: updated }
    })
  }

  function addFreshIngredientRow() {
    setForm((f) => ({
      ...f,
      ingredients: [
        ...f.ingredients,
        { name: '', quantity: '', importLineText: null, isPantry: false, catalogId: null, catalogName: null, matchError: null },
      ],
    }))
  }

  function addPantryIngredientRow() {
    setForm((f) => ({
      ...f,
      ingredients: [
        ...f.ingredients,
        { name: '', quantity: '', importLineText: null, isPantry: true, catalogId: null, catalogName: null, matchError: null },
      ],
    }))
  }

  function removeIngredientRow(index: number) {
    setForm(f => ({ ...f, ingredients: f.ingredients.filter((_, i) => i !== index) }))
  }

  function toggleIngredientPantry(index: number) {
    setForm((f) => {
      const item = { ...f.ingredients[index], isPantry: !f.ingredients[index].isPantry }
      const rest = f.ingredients.filter((_, i) => i !== index)
      const fresh = rest.filter((r) => !r.isPantry)
      const pantry = rest.filter((r) => r.isPantry)
      if (item.isPantry) pantry.push(item)
      else fresh.push(item)
      return { ...f, ingredients: [...fresh, ...pantry] }
    })
  }

  async function resolveIngredientId(
    row: IngredientRow
  ): Promise<{ id: string } | { error: string }> {
    if (row.catalogId && !row.matchError) {
      return { id: row.catalogId }
    }

    const matchText = row.importLineText?.trim() || row.name
    const classified = classifyIngredientLine(matchText, ingredientCatalog)
    if (!classified.catalogId) {
      return { error: classified.matchError ?? 'Ingredient not in bank.' }
    }

    return { id: classified.catalogId }
  }

  function displayNameForIngredientRow(row: IngredientRow): string {
    return (row.importLineText?.trim() || row.name.trim()) || ''
  }

  async function saveIngredientsForRecipeId(
    recipeId: string,
    ingredients: IngredientRow[]
  ): Promise<string | null> {
    const validIngredients = ingredients.filter((i) => i.name.trim())

    const { error: deleteError } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('recipe_id', recipeId)

    if (deleteError) {
      return `Failed to update ingredients: ${deleteError.message}`
    }

    for (const row of validIngredients) {
      const result = await resolveIngredientId(row)
      if ('error' in result) {
        return `Failed to save ingredient "${row.name.trim()}": ${result.error}`
      }

      const baseRow = {
        recipe_id: recipeId,
        ingredient_id: result.id,
        quantity: row.quantity.trim() || null,
      }
      let rowPayload: Record<string, unknown> = baseRow
      if (supportsRecipeDisplayName) {
        rowPayload = {
          ...baseRow,
          display_name: displayNameForIngredientRow(row) || null,
        }
      }

      let { error: riError } = await supabase.from('recipe_ingredients').insert(rowPayload)

      if (riError && supportsRecipeDisplayName && isDisplayNameSchemaError(riError)) {
        setSupportsRecipeDisplayName(false)
        const retry = await supabase.from('recipe_ingredients').insert(baseRow)
        riError = retry.error
      }

      if (riError) {
        return `Failed to link ingredient "${row.name.trim()}": ${riError.message}`
      }
    }

    return null
  }

  async function saveIngredientsForRecipe(recipeId: string) {
    const err = await saveIngredientsForRecipeId(recipeId, form.ingredients)
    if (err) {
      setFormError(err)
      return false
    }
    return true
  }

  async function saveImportedRecipe(imported: ImportedRecipe): Promise<string | null> {
    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        name: imported.name.trim(),
        effort_level: 'low',
        prep_minutes: imported.prep_minutes ? parseInt(imported.prep_minutes) : null,
        cook_minutes: imported.cook_minutes ? parseInt(imported.cook_minutes) : null,
        instructions: imported.instructions.trim() || null,
        dietary_tags: [],
        source_url: imported.source_url.trim() || null,
      })
      .select('id')
      .single()

    if (recipeError || !recipeData) {
      return recipeError?.message ?? 'Failed to save recipe.'
    }

    const classified = classifyIngredientRows(
      imported.ingredients.filter((i) => i.name.trim()),
      ingredientCatalog
    )
    const invalid = classified.find((r) => r.matchError)
    if (invalid?.matchError) return invalid.matchError

    return saveIngredientsForRecipeId(recipeData.id, classified)
  }

  async function handleSaveAllImports() {
    if (!pendingImports?.length) return

    setBatchError(null)
    setBatchSaving(true)
    let saved = 0

    for (const recipe of pendingImports) {
      const err = await saveImportedRecipe(recipe)
      if (err) {
        setBatchError(
          saved > 0
            ? `Saved ${saved} of ${pendingImports.length} recipes. ${err}`
            : err
        )
        setBatchSaving(false)
        loadRecipes()
        return
      }
      saved++
    }

    setPendingImports(null)
    setBatchSaving(false)
    loadRecipes()
  }

  function openPendingForEdit(index: number) {
    const recipe = pendingImports?.[index]
    if (!recipe) return
    setEditingId(null)
    setEditingPendingImportIndex(index)
    setForm(importedToFormState(recipe))
    setFormError(null)
    setShowForm(true)
    setShowImport(false)
  }

  async function handleSave() {
    setFormError(null)
    if (!form.name.trim()) {
      setFormError('Recipe name is required.')
      return
    }
    if (catalogLoading) {
      setFormError('Loading ingredient bank…')
      return
    }
    const ingredientErr = validateAllIngredients()
    if (ingredientErr) {
      setFormError(ingredientErr)
      return
    }

    setSaving(true)

    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        name: form.name.trim(),
        effort_level: normalizeEffortLevel(form.effort_level),
        prep_minutes: form.prep_minutes ? parseInt(form.prep_minutes) : null,
        cook_minutes: form.cook_minutes ? parseInt(form.cook_minutes) : null,
        instructions: form.instructions.trim() || null,
        dietary_tags: form.dietary_tags,
        source_url: form.source_url.trim() || null,
      })
      .select('id')
      .single()

    if (recipeError || !recipeData) {
      setFormError(recipeError?.message ?? 'Failed to save recipe.')
      setSaving(false)
      return
    }

    const ingredientsSaved = await saveIngredientsForRecipe(recipeData.id)
    if (!ingredientsSaved) {
      setSaving(false)
      return
    }

    const pendingIndex = editingPendingImportIndex
    if (pendingIndex !== null) {
      setPendingImports((prev) => prev?.filter((_, i) => i !== pendingIndex) ?? null)
      cancelPendingImportEdit()
    } else {
      cancelForm()
    }
    setSaving(false)
    loadRecipes()
  }

  async function handleUpdate() {
    if (!editingId) return

    setFormError(null)
    if (!form.name.trim()) {
      setFormError('Recipe name is required.')
      return
    }
    if (catalogLoading) {
      setFormError('Loading ingredient bank…')
      return
    }
    const ingredientErr = validateAllIngredients()
    if (ingredientErr) {
      setFormError(ingredientErr)
      return
    }

    setSaving(true)

    const { error: recipeError } = await supabase
      .from('recipes')
      .update({
        name: form.name.trim(),
        effort_level: normalizeEffortLevel(form.effort_level),
        prep_minutes: form.prep_minutes ? parseInt(form.prep_minutes) : null,
        cook_minutes: form.cook_minutes ? parseInt(form.cook_minutes) : null,
        instructions: form.instructions.trim() || null,
        dietary_tags: form.dietary_tags,
        source_url: form.source_url.trim() || null,
      })
      .eq('id', editingId)

    if (recipeError) {
      setFormError(recipeError.message ?? 'Failed to update recipe.')
      setSaving(false)
      return
    }

    const ingredientsSaved = await saveIngredientsForRecipe(editingId)
    if (!ingredientsSaved) {
      setSaving(false)
      return
    }

    const { data: updatedRow, error: fetchError } = await supabase
      .from('recipes')
      .select(RECIPE_WITH_INGREDIENTS_SELECT)
      .eq('id', editingId)
      .single()

    if (fetchError || !updatedRow) {
      setFormError(fetchError?.message ?? 'Recipe saved but list could not refresh.')
      setSaving(false)
      return
    }

    const updated = normalizeRecipes([updatedRow])[0]
    setRecipes((prev) =>
      prev.map((r) => (r.id === editingId ? updated : r))
    )

    cancelForm()
    setSaving(false)
  }

  function requestDelete() {
    if (!editingId) return
    setFormError(null)
    setShowDeleteConfirm(true)
  }

  function cancelDeleteConfirm() {
    setShowDeleteConfirm(false)
    setFormError(null)
  }

  async function confirmDelete() {
    if (!editingId) return

    setFormError(null)
    setDeleting(true)

    const { error: linksError } = await supabase
      .from('recipe_ingredients')
      .delete()
      .eq('recipe_id', editingId)

    if (linksError) {
      setFormError(`Failed to delete ingredients: ${linksError.message}`)
      setDeleting(false)
      return
    }

    const { data: deleted, error: recipeError } = await supabase
      .from('recipes')
      .delete()
      .eq('id', editingId)
      .select('id')

    if (recipeError) {
      setFormError(recipeError.message ?? 'Failed to delete recipe.')
      setDeleting(false)
      return
    }

    if (!deleted?.length) {
      setFormError(
        'Recipe could not be deleted. Run docs/supabase-enable-delete.sql in the Supabase SQL editor, then try again.'
      )
      setDeleting(false)
      return
    }

    setShowDeleteConfirm(false)
    const removedId = editingId
    cancelForm()
    setDeleting(false)
    setRecipes((prev) => prev.filter((r) => r.id !== removedId))
  }

  function requestDeleteAll() {
    setDeleteAllError(null)
    setShowDeleteAllConfirm(true)
  }

  function cancelDeleteAllConfirm() {
    setShowDeleteAllConfirm(false)
    setDeleteAllError(null)
  }

  async function confirmDeleteAll() {
    if (recipes.length === 0) return

    setDeleteAllError(null)
    setDeletingAll(true)
    const ids = recipes.map((r) => r.id)

    const { error: linksError } = await supabase
      .from('recipe_ingredients')
      .delete()
      .in('recipe_id', ids)

    if (linksError) {
      setDeleteAllError(`Failed to delete ingredients: ${linksError.message}`)
      setDeletingAll(false)
      return
    }

    const { data: deleted, error: recipeError } = await supabase
      .from('recipes')
      .delete()
      .in('id', ids)
      .select('id')

    if (recipeError) {
      setDeleteAllError(recipeError.message ?? 'Failed to delete recipes.')
      setDeletingAll(false)
      return
    }

    if (!deleted?.length) {
      setDeleteAllError(
        'Recipes could not be deleted. Run docs/supabase-enable-delete.sql in the Supabase SQL editor, then try again.'
      )
      setDeletingAll(false)
      return
    }

    setShowDeleteAllConfirm(false)
    cancelForm()
    setDeletingAll(false)
    loadRecipes()
  }

  const formPanelProps = {
    form,
    formError,
    saving,
    onNameChange: (value: string) => setForm(f => ({ ...f, name: value })),
    onEffortChange: (level: string) => setForm(f => ({ ...f, effort_level: level })),
    onPrepChange: (value: string) => setForm(f => ({ ...f, prep_minutes: value })),
    onCookChange: (value: string) => setForm(f => ({ ...f, cook_minutes: value })),
    onInstructionsChange: (value: string) => setForm(f => ({ ...f, instructions: value })),
    onToggleTag: toggleTag,
    onUpdateIngredient: updateIngredient,
    onAddFreshIngredientRow: addFreshIngredientRow,
    onAddPantryIngredientRow: addPantryIngredientRow,
    onRemoveIngredientRow: removeIngredientRow,
    onToggleIngredientPantry: toggleIngredientPantry,
    onReclassifyIngredient: reclassifyIngredientAt,
    onAddToIngredientBank: handleAddToIngredientBank,
    onRequestIngredient: handleRequestIngredient,
    isAdmin,
  }

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className="text-2xl font-semibold text-gray-900 dark:text-gray-100">📚 Recipe bank</h1>
        <button
          type="button"
          onClick={() => (isAddingRecipe ? cancelForm() : openAddChooser())}
          className="shrink-0 text-sm font-medium bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 px-4 py-2 rounded-lg hover:bg-gray-700 dark:hover:bg-gray-300 transition-colors"
        >
          {isAddingRecipe ? 'Cancel' : '+ Add recipe'}
        </button>
      </div>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-8">Your saved family recipes</p>

      {showAddChooser && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">Add recipe</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Choose how you want to add your recipe.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={selectAddManual}
              className="text-left text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              Enter manually
              <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                Fill in the recipe form yourself
              </span>
            </button>
            <button
              type="button"
              onClick={() => selectAddImport('website')}
              className="text-left text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              Import from URL
              <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                Paste a link from a recipe website
              </span>
            </button>
            <button
              type="button"
              onClick={() => selectAddImport('google-doc')}
              className="text-left text-sm font-medium border border-gray-200 dark:border-gray-600 text-gray-900 dark:text-gray-100 rounded-lg px-4 py-3 hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              Import from Google Doc
              <span className="block text-xs font-normal text-gray-500 dark:text-gray-400 mt-0.5">
                Paste a shared doc with Heading 1 recipes
              </span>
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6 flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
              {importMode === 'google-doc' ? 'Import from Google Doc' : 'Import from URL'}
            </h2>
            <button
              type="button"
              onClick={backToAddChooser}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
            >
              ← Back
            </button>
          </div>
          {importMode === 'google-doc' ? (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paste your Google Docs link (shared as{' '}
              <span className="font-medium text-gray-700 dark:text-gray-300">
                Anyone with the link → Viewer
              </span>
              ). Each recipe uses <span className="font-medium">Heading 1</span> for the title, and{' '}
              <span className="font-medium">Heading 2</span> for{' '}
              <span className="font-medium">Ingredients</span> and{' '}
              <span className="font-medium">Method</span>. If the doc has several recipes, you can
              choose which Heading 1 titles to import.
            </p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Paste a link from a recipe site.
            </p>
          )}
          <input
            type="url"
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !importing && handleImport()}
            placeholder={
              importMode === 'google-doc'
                ? 'https://docs.google.com/document/d/.../edit'
                : 'https://www.recipetineats.com/lentil-soup/'
            }
            className={inputClass}
            disabled={importing}
          />
          {importError && <p className="text-red-500 text-sm">{importError}</p>}
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
          >
            {importing ? 'Importing...' : importMode === 'google-doc' ? 'Import recipes' : 'Import recipe'}
          </button>
        </div>
      )}

      {docImportCandidates && docImportCandidates.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {docImportCandidates.length} recipes found — select Heading 1 to import
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Tick the recipes you want, then continue to review and save.
          </p>
          <div className="flex flex-wrap gap-3 text-sm">
            <button
              type="button"
              onClick={selectAllDocImports}
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 underline underline-offset-2"
            >
              Select all
            </button>
            <button
              type="button"
              onClick={selectNoDocImports}
              className="text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100 underline underline-offset-2"
            >
              Select none
            </button>
            <span className="text-gray-400 dark:text-gray-500">
              {selectedDocImportNames.size} of {docImportCandidates.length} selected
            </span>
          </div>
          <ul className="flex flex-col gap-2">
            {docImportCandidates.map((recipe) => {
              const checked = selectedDocImportNames.has(recipe.name)
              return (
                <li key={recipe.name}>
                  <label className="flex items-start gap-3 border border-gray-100 dark:border-gray-800 rounded-lg px-4 py-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleDocImportSelection(recipe.name)}
                      className="mt-0.5 shrink-0 rounded border-gray-300 dark:border-gray-600"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                        {recipe.name}
                      </p>
                      <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                        {recipe.ingredients.filter((i) => i.name.trim()).length} ingredients
                        {recipe.instructions.trim() ? ' · method included' : ''}
                      </p>
                    </div>
                  </label>
                </li>
              )
            })}
          </ul>
          {importError && <p className="text-red-500 text-sm">{importError}</p>}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={confirmDocImportSelection}
              disabled={selectedDocImportNames.size === 0}
              className="bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
            >
              Continue with {selectedDocImportNames.size} recipe
              {selectedDocImportNames.size === 1 ? '' : 's'}
            </button>
            <button
              type="button"
              onClick={() => resetImport(true)}
              className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium hover:border-gray-400 dark:hover:border-gray-500 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {pendingImports && pendingImports.length > 0 && (
        <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-6 mb-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">
            {pendingImports.length} recipe{pendingImports.length === 1 ? '' : 's'} to import
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Review below, then save or open one to edit before saving.
          </p>
          <ul className="flex flex-col gap-2">
            {pendingImports.map((recipe, index) => (
              <li
                key={`${recipe.name}-${index}`}
                className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 ${
                  editingPendingImportIndex === index
                    ? 'border-gray-400 dark:border-gray-500 bg-gray-50 dark:bg-gray-800/50'
                    : 'border-gray-100 dark:border-gray-800'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                    {recipe.name}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">
                    {recipe.ingredients.filter((i) => i.name.trim()).length} ingredients
                    {recipe.instructions.trim() ? ' · method included' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openPendingForEdit(index)}
                  className="shrink-0 text-sm text-gray-600 dark:text-gray-300 hover:text-gray-900 dark:hover:text-gray-100"
                >
                  Edit
                </button>
              </li>
            ))}
          </ul>
          {batchError && <p className="text-red-500 text-sm">{batchError}</p>}
          <div className="flex flex-col sm:flex-row gap-3">
            <button
              type="button"
              onClick={handleSaveAllImports}
              disabled={batchSaving}
              className="bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900 rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-700 dark:hover:bg-gray-300 disabled:opacity-50 transition-colors"
            >
              {batchSaving
                ? 'Saving...'
                : `Save ${pendingImports.length} recipe${pendingImports.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => resetImport(true)}
              disabled={batchSaving}
              className="border border-gray-200 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium hover:border-gray-400 dark:hover:border-gray-500 disabled:opacity-50 transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {!supportsRecipeDisplayName && (showForm || editingId) && (
        <p className="text-sm text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-lg px-4 py-3 mb-6">
          Run{' '}
          <span className="font-mono text-xs">docs/supabase-recipe-ingredient-display-name.sql</span>{' '}
          in the Supabase SQL editor to keep full ingredient text on saved recipes. Until then,
          saves link to the bank but only store the canonical ingredient name.
        </p>
      )}

      {showForm && !editingId && (
        <div className="mb-6">
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={backToAddChooser}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
            >
              {editingPendingImportIndex !== null
                ? '← Back to import list'
                : '← Back'}
            </button>
          </div>
          <RecipeFormPanel
            {...formPanelProps}
            title={
              editingPendingImportIndex !== null ? 'Review import' : 'New recipe'
            }
            saveLabel="Save recipe"
            onSave={handleSave}
            onCancel={cancelForm}
          />
        </div>
      )}

      {/* ── Recipe list ── */}
      {loading && <p className="text-gray-400 dark:text-gray-500 text-sm">Loading recipes...</p>}

      <div className="flex flex-col gap-3">
        {recipes.map((recipe) =>
          editingId === recipe.id ? (
            <RecipeFormPanel
              key={recipe.id}
              {...formPanelProps}
              title="Edit recipe"
              saveLabel="Update recipe"
              onSave={handleUpdate}
              onCancel={cancelForm}
              onDelete={requestDelete}
              deleting={deleting}
            />
          ) : (
            <div
              key={recipe.id}
              className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5 hover:border-gray-300 dark:hover:border-gray-600 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <h2 className="text-base font-semibold text-gray-900 dark:text-gray-100">{recipe.name}</h2>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => openEditForm(recipe)}
                    aria-label={`Edit ${recipe.name}`}
                    className="p-1.5 rounded-lg text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  >
                    <EditIcon />
                  </button>
                  {recipe.effort_level && (
                    <span className={`text-xs font-medium px-2.5 py-1 rounded-full ${effortBadgeClass[normalizeEffortLevel(recipe.effort_level)] ?? 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}>
                      {effortLabel(recipe.effort_level)}
                    </span>
                  )}
                </div>
              </div>

              {recipe.source_url && (
                <a
                  href={recipe.source_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2 mb-2 inline-block max-w-full truncate"
                  title={recipe.source_url}
                >
                  {shortenRecipeUrl(recipe.source_url)}
                </a>
              )}

              <div className="flex gap-4 text-xs text-gray-400 dark:text-gray-500 mb-3">
                {recipe.prep_minutes && <span>⏱ {recipe.prep_minutes} min prep</span>}
                {recipe.cook_minutes && <span>🔥 {recipe.cook_minutes} min cook</span>}
              </div>

              {recipe.dietary_tags?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {recipe.dietary_tags.map(tag => (
                    <span key={tag} className="text-xs bg-green-50 text-green-700 border border-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800 rounded-full px-2.5 py-0.5">
                      {tag}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {!loading && recipes.length > 0 && (
        <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
          <button
            type="button"
            onClick={requestDeleteAll}
            disabled={deletingAll || deleting}
            className="w-full text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            Delete all recipes
          </button>
        </div>
      )}

      {showDeleteConfirm && editingId && (
        <DeleteConfirmDialog
          title="Delete recipe?"
          error={formError}
          deleting={deleting}
          onConfirm={confirmDelete}
          onCancel={cancelDeleteConfirm}
        >
          <p>
            Are you sure you want to delete{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">
              &ldquo;{form.name.trim() || 'this recipe'}&rdquo;
            </span>
            ? This cannot be undone.
          </p>
        </DeleteConfirmDialog>
      )}

      {showDeleteAllConfirm && (
        <DeleteConfirmDialog
          title="Delete all recipes?"
          error={deleteAllError}
          deleting={deletingAll}
          onConfirm={confirmDeleteAll}
          onCancel={cancelDeleteAllConfirm}
          confirmLabel="Delete all"
        >
          <p>
            This will permanently delete all{' '}
            <span className="font-medium text-gray-900 dark:text-gray-100">
              {recipes.length} recipe{recipes.length === 1 ? '' : 's'}
            </span>{' '}
            in your recipe bank. This cannot be undone.
          </p>
        </DeleteConfirmDialog>
      )}
    </main>
  )
}