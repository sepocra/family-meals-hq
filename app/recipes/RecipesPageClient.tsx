'use client'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  importedToFormFields,
  normalizeImportUrl,
  type ImportedRecipe,
} from '../../lib/recipe-import'
import {
  classifyIngredientLine,
  classifyIngredientLineRelaxed,
  classifyIngredientRows,
  createIngredientInBank,
  fetchIngredientCatalog,
  INGREDIENT_BANK_CATEGORIES,
  isPantryCategory,
  suggestIngredientBankName,
  type CatalogIngredient,
  type IngredientBankCategory,
} from '../../lib/ingredient-catalog'
import {
  createIngredientRequest,
  fetchPendingIngredientRequestNames,
  normalizeRequestName,
} from '../../lib/ingredient-requests'
import { MealTypeFilterBar } from '../../components/MealTypeFilterBar'
import { useAuth } from '../../components/AuthProvider'
import { getAuthUserId } from '../../lib/auth-user'
import {
  btnPrimary,
  btnSecondary,
  fieldInput,
  pageTitleAccent,
  surfaceCard,
  textMuted,
} from '../../lib/brand-classes'
import { isMeatIngredient } from '../../lib/ingredient-category'
import type { RecipeListItem } from '../../lib/recipe-list'
import { RECIPE_LIST_SELECT } from '../../lib/recipe-list'
import { recipeMatchesMealTypeFilter } from '../../lib/recipe-meal-type-filter'
import {
  DIETARY_TAGS,
  MEAL_TYPE_TAGS,
  mealTypeBadgeClasses,
  mealTypeToggleClasses,
} from '../../lib/recipe-tags'
import { isGoogleDocSourceUrl, sanitizeRecipeSourceUrl, shortenRecipeUrl } from '../../lib/recipe-url'
import { supabase } from '../../lib/supabase'
import { useLongPress } from '../../lib/use-long-press'

type RecipeIngredient = {
  quantity: string
  display_name: string | null
  ingredient_id?: string | null
  ingredients: {
    name: string
    category: string | null
  } | null
}

type Recipe = {
  id: string
  name: string
  prep_minutes: number | null
  cook_minutes: number | null
  instructions: string | null
  dietary_tags: string[]
  meal_types: string[]
  source_url: string | null
  created_at?: string | null
  recipe_ingredients: RecipeIngredient[]
}

/** Raw shape from Supabase embeds (ingredients may be object or array). */
type RecipeRow = {
  id: string
  name: string
  prep_minutes: number | null
  cook_minutes: number | null
  instructions: string | null
  dietary_tags: string[]
  meal_types?: string[]
  source_url: string | null
  created_at?: string | null
  recipe_ingredients?: {
    quantity: string
    display_name?: string | null
    ingredient_id?: string | null
    ingredients:
      | {
          name: string
          category: string | null
        }
      | {
          name: string
          category: string | null
        }[]
      | null
  }[]
}

const RECIPE_WITH_INGREDIENTS_SELECT = `${RECIPE_LIST_SELECT}, recipe_ingredients (quantity, display_name, ingredient_id, ingredients (name, category))`

const RECIPE_WITH_INGREDIENTS_SELECT_LEGACY = `${RECIPE_LIST_SELECT}, recipe_ingredients (quantity, ingredient_id, ingredients (name, category))`

type RecipeSort = 'date-desc' | 'date-asc' | 'name-asc' | 'name-desc'

const RECIPE_SORT_OPTIONS: { value: RecipeSort; label: string }[] = [
  { value: 'date-desc', label: 'Import date (newest first)' },
  { value: 'date-asc', label: 'Import date (oldest first)' },
  { value: 'name-asc', label: 'Name (A–Z)' },
  { value: 'name-desc', label: 'Name (Z–A)' },
]

function sortRecipes(recipes: Recipe[], sort: RecipeSort): Recipe[] {
  return [...recipes].sort((a, b) => {
    if (sort === 'date-desc' || sort === 'date-asc') {
      const ta = a.created_at ?? ''
      const tb = b.created_at ?? ''
      if (ta !== tb) {
        const cmp = ta.localeCompare(tb)
        return sort === 'date-desc' ? -cmp : cmp
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    }
    const cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' })
    if (cmp !== 0) return sort === 'name-desc' ? -cmp : cmp
    const ta = a.created_at ?? ''
    const tb = b.created_at ?? ''
    return tb.localeCompare(ta)
  })
}

function isDisplayNameSchemaError(error: { message?: string } | null): boolean {
  const msg = error?.message ?? ''
  return (
    msg.includes('display_name') &&
    (msg.includes('schema cache') || msg.includes('Could not find'))
  )
}

const RECIPE_INGREDIENT_LINK_SELECT =
  'quantity, display_name, ingredient_id, ingredients (name, category)'

const RECIPE_INGREDIENT_LINK_SELECT_LEGACY =
  'quantity, ingredient_id, ingredients (name, category)'

function normalizeRecipeIngredientRows(
  rows: NonNullable<RecipeRow['recipe_ingredients']>
): RecipeIngredient[] {
  return rows.map((ri) => ({
    quantity: ri.quantity,
    display_name: ri.display_name ?? null,
    ingredient_id: ri.ingredient_id ?? null,
    ingredients: Array.isArray(ri.ingredients)
      ? (ri.ingredients[0] ?? null)
      : ri.ingredients,
  }))
}

function normalizeRecipes(rows: RecipeRow[]): Recipe[] {
  return rows.map((recipe) => ({
    ...recipe,
    meal_types: recipe.meal_types ?? [],
    recipe_ingredients: normalizeRecipeIngredientRows(recipe.recipe_ingredients ?? []),
  }))
}

const inputClass = fieldInput

const qtyInputClass =
  'w-[3.75rem] shrink-0 box-border border border-border rounded-xl px-1.5 py-2 text-sm bg-card text-primary outline-none focus:border-coral'

type IngredientRow = {
  name: string
  quantity: string
  /** Original imported line text; used for display_name on save. */
  importLineText: string | null
  isPantry: boolean
  catalogId: string | null
  catalogName: string | null
  matchError: string | null
  bankRequestPending?: boolean
}

type RecipeFormState = {
  name: string
  prep_minutes: string
  cook_minutes: string
  instructions: string
  dietary_tags: string[]
  meal_types: string[]
  source_url: string
  ingredients: IngredientRow[]
}

const emptyForm: RecipeFormState = {
  name: '',
  prep_minutes: '',
  cook_minutes: '',
  instructions: '',
  dietary_tags: [],
  meal_types: [],
  source_url: '',
  ingredients: [
    { name: '', quantity: '', importLineText: null, isPantry: false, catalogId: null, catalogName: null, matchError: null },
    { name: '', quantity: '', importLineText: null, isPantry: false, catalogId: null, catalogName: null, matchError: null },
    { name: '', quantity: '', importLineText: null, isPantry: false, catalogId: null, catalogName: null, matchError: null },
  ],
}

function formHasNamedIngredients(ingredients: IngredientRow[]): boolean {
  return ingredients.some((i) => i.name.trim())
}

function recipeToForm(recipe: Recipe, catalog: CatalogIngredient[]): RecipeFormState {
  const catalogById = new Map(catalog.map((c) => [c.id, c.name]))
  const rows = recipe.recipe_ingredients.map((ri) => {
    const savedDisplay = ri.display_name?.trim() || ''
    const fromJoin = ri.ingredients?.name?.trim() || ''
    const fromCatalog =
      (ri.ingredient_id && catalogById.get(ri.ingredient_id)) || ''
    const name = savedDisplay || fromJoin || fromCatalog
    return {
      name,
      quantity: ri.quantity ?? '',
      lineText: savedDisplay || undefined,
    }
  })
  const ingredients = classifyIngredientRows(
    rows.filter((r) => r.name.trim() || r.quantity.trim()),
    catalog
  )
  return {
    name: recipe.name,
    prep_minutes: recipe.prep_minutes?.toString() ?? '',
    cook_minutes: recipe.cook_minutes?.toString() ?? '',
    instructions: recipe.instructions ?? '',
    dietary_tags: recipe.dietary_tags ?? [],
    meal_types: recipe.meal_types ?? [],
    source_url: sanitizeRecipeSourceUrl(recipe.source_url) ?? '',
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
  onPrepChange: (value: string) => void
  onCookChange: (value: string) => void
  onInstructionsChange: (value: string) => void
  onToggleTag: (tag: string) => void
  onToggleMealType: (tag: string) => void
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
  onRestoreIngredientsFromSource?: () => void
  restoringIngredients?: boolean
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
      className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 min-w-0 max-w-full"
    >
      <p className="text-xs font-medium text-primary/80">
        Request admin to add to ingredient bank
      </p>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <label className="text-xs text-muted">Name</label>
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. chicken thigh"
            className={inputClass}
          />
        </div>
        <div className="sm:w-36 shrink-0 flex flex-col gap-1">
          <label className="text-xs text-muted">Category</label>
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
        className="self-start text-sm font-medium btn-primary px-3 py-1.5 text-sm disabled:opacity-50 transition-colors"
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
      className="mt-1 flex flex-col gap-2 rounded-lg border border-border bg-surface p-3 min-w-0 max-w-full"
    >
      <p className="text-xs font-medium text-primary/80">
        Add to ingredient bank
      </p>
      <div className="flex flex-col sm:flex-row gap-2 sm:items-end">
        <div className="flex-1 min-w-0 flex flex-col gap-1">
          <label className="text-xs text-muted">Name</label>
          <input
            type="text"
            value={bankName}
            onChange={(e) => setBankName(e.target.value)}
            placeholder="e.g. chicken thigh"
            className={inputClass}
          />
        </div>
        <div className="sm:w-36 shrink-0 flex flex-col gap-1">
          <label className="text-xs text-muted">Category</label>
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
        className="self-start text-sm font-medium btn-primary px-3 py-1.5 text-sm disabled:opacity-50 transition-colors"
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
      className="shrink-0 p-2 rounded-lg text-primary/80 hover:text-gray-900 dark:hover:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">
            {title}
          </label>
          <p className="text-xs text-muted mt-0.5">{hint}</p>
        </div>
        <div className="flex flex-col gap-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted italic">None yet</p>
          ) : (
            rows.map(({ row, index }) => (
              <div key={`${isPantry}-${index}`} className="flex flex-col gap-1 min-w-0 max-w-full">
                <div className="flex gap-2 items-center min-w-0">
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
                    placeholder="Qty"
                    aria-label="Quantity"
                    className={qtyInputClass}
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
                    <p className="text-xs text-red-500 break-words">{row.matchError}</p>
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
                {isAdmin && row.catalogId && !row.matchError && row.catalogName && (
                  <p className="text-xs text-muted truncate min-w-0">
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
          className="text-sm text-muted hover:text-gray-600 dark:hover:text-gray-300 text-left"
        >
          {addLabel}
        </button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 min-w-0 max-w-full">
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
  onPrepChange,
  onCookChange,
  onInstructionsChange,
  onToggleTag,
  onToggleMealType,
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
  onRestoreIngredientsFromSource,
  restoringIngredients = false,
}: RecipeFormPanelProps) {
  const showIngredientRecovery =
    Boolean(onRestoreIngredientsFromSource) &&
    !formHasNamedIngredients(form.ingredients) &&
    form.source_url.trim().length > 0

  return (
    <div className="surface-card p-4 sm:p-6 flex flex-col gap-4 min-w-0 max-w-full overflow-hidden">
      <div className="flex items-center justify-between gap-2 min-w-0">
        <h2 className="text-base font-semibold text-primary min-w-0 truncate">{title}</h2>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-muted hover:text-gray-700 dark:hover:text-gray-200"
        >
          Cancel
        </button>
      </div>

      {showIngredientRecovery && (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/40 px-4 py-3 flex flex-col gap-2">
          <p className="text-sm text-amber-900 dark:text-amber-100">
            No ingredients are stored for this recipe (links may have been removed earlier).
            {' Pull them again from the original recipe URL, then save.'}
          </p>
          <button
            type="button"
            onClick={onRestoreIngredientsFromSource}
            disabled={saving || deleting || restoringIngredients}
            className={`${btnSecondary} text-sm self-start`}
          >
            {restoringIngredients ? 'Fetching ingredients…' : 'Restore ingredients from URL'}
          </button>
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted uppercase tracking-wide">Name</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="e.g. Spaghetti bolognese"
          className={inputClass}
        />
      </div>

      <div className="flex flex-col sm:flex-row gap-4 min-w-0">
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">Prep (mins)</label>
          <input
            type="number"
            value={form.prep_minutes}
            onChange={(e) => onPrepChange(e.target.value)}
            placeholder="15"
            className={inputClass}
          />
        </div>
        <div className="flex flex-col gap-1 flex-1 min-w-0">
          <label className="text-xs font-semibold text-muted uppercase tracking-wide">Cook (mins)</label>
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
        <label className="text-xs font-semibold text-muted uppercase tracking-wide">Meal type</label>
        <div className="flex flex-wrap gap-2">
          {MEAL_TYPE_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleMealType(tag)}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${mealTypeToggleClasses(
                tag,
                form.meal_types.includes(tag)
              )}`}
            >
              {tag}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-semibold text-muted uppercase tracking-wide">Dietary tags</label>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map((tag) => (
            <button
              key={tag}
              type="button"
              onClick={() => onToggleTag(tag)}
              className={`text-sm px-3 py-1.5 rounded-full border transition-colors ${
                form.dietary_tags.includes(tag)
                  ? 'bg-green-100 text-green-800 border-green-200 dark:bg-green-900/40 dark:text-green-300 dark:border-green-800'
                  : 'border-border text-primary/80 hover:border-muted'
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
        <label className="text-xs font-semibold text-muted uppercase tracking-wide">Instructions</label>
        <textarea
          value={form.instructions}
          onChange={(e) => onInstructionsChange(e.target.value)}
          placeholder="Step by step method..."
          rows={4}
          className={`${inputClass} resize-none`}
        />
      </div>

      {formError && <p className="text-red-500 text-sm">{formError}</p>}

      <div
        className={`flex flex-col-reverse sm:flex-row gap-3 min-w-0 ${onDelete ? 'sm:justify-between' : ''}`}
      >
        {onDelete && (
          <button
            type="button"
            onClick={onDelete}
            disabled={saving || deleting}
            className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 transition-colors shrink-0"
          >
            {deleting ? 'Deleting...' : 'Delete recipe'}
          </button>
        )}
        <button
          type="button"
          onClick={onSave}
          disabled={saving || deleting}
          className={`btn-primary px-4 py-2.5 text-sm disabled:opacity-50 transition-colors ${onDelete ? 'sm:ml-auto' : 'w-full'}`}
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
      <div className="surface-card p-6 max-w-sm w-full flex flex-col gap-4 shadow-lg">
        <h2 id="delete-dialog-title" className="text-base font-semibold text-primary">
          {title}
        </h2>
        <div className="text-sm text-primary/80">{children}</div>
        {error && <p className="text-red-500 text-sm">{error}</p>}
        <div className="flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="flex-1 border border-border text-gray-700 dark:text-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium hover:border-muted disabled:opacity-50 transition-colors"
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

type RecipeBankCardProps = {
  recipe: Recipe
  selectionMode: boolean
  selected: boolean
  onToggleSelect: () => void
  onEnterSelection: () => void
  onEdit: () => void
}

function RecipeBankCard({
  recipe,
  selectionMode,
  selected,
  onToggleSelect,
  onEnterSelection,
  onEdit,
}: RecipeBankCardProps) {
  const longPress = useLongPress(onEnterSelection)
  const displaySourceUrl = sanitizeRecipeSourceUrl(recipe.source_url)
  const [showFreshIngredients, setShowFreshIngredients] = useState(false)

  const freshIngredients = recipe.recipe_ingredients
    .map((ri) => {
      const name = ri.display_name?.trim() || ri.ingredients?.name?.trim() || ''
      const quantity = ri.quantity?.trim() || ''
      const category = ri.ingredients?.category ?? null
      if (!name) return null
      if (isPantryCategory(category)) return null
      return quantity ? `${quantity} ${name}` : name
    })
    .filter((line): line is string => Boolean(line))

  const handleClick = () => {
    if (longPress.consumeLongPress()) return
    if (selectionMode) {
      onToggleSelect()
      return
    }
    setShowFreshIngredients((prev) => !prev)
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={
        (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            if (selectionMode) {
                onToggleSelect()
              } else {
                setShowFreshIngredients((prev) => !prev)
              }
          }
        }
      }
      className={`${surfaceCard} p-5 transition-colors touch-manipulation ${
        selectionMode ? 'cursor-pointer select-none' : 'cursor-pointer hover:border-muted'
      } ${selectionMode && selected ? 'border-coral ring-1 ring-coral' : ''}`}
      onPointerDown={longPress.onPointerDown}
      onPointerUp={longPress.onPointerUp}
      onPointerLeave={longPress.onPointerLeave}
      onPointerCancel={longPress.onPointerCancel}
      onClick={handleClick}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="flex items-start gap-3">
        {selectionMode && (
          <input
            type="checkbox"
            checked={selected}
            onChange={onToggleSelect}
            onClick={(e) => e.stopPropagation()}
            className="mt-1 shrink-0 rounded border-gray-300 dark:border-gray-600"
            aria-label={
              selected
                ? `Deselect ${recipe.name}`
                : `Select ${recipe.name} for deletion`
            }
          />
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-3 mb-3">
            <h2 className="text-base font-semibold text-primary">{recipe.name}</h2>
            <div className="flex items-center gap-2 shrink-0">
              {!selectionMode && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation()
                    onEdit()
                  }}
                  aria-label={`Edit ${recipe.name}`}
                  className="p-1.5 rounded-lg text-muted hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <EditIcon />
                </button>
              )}
            </div>
          </div>

          {displaySourceUrl && (
            <a
              href={displaySourceUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => {
                if (selectionMode) e.preventDefault()
                e.stopPropagation()
              }}
              className="text-xs text-muted hover:text-gray-800 dark:hover:text-gray-200 underline underline-offset-2 mb-2 inline-block max-w-full truncate"
              title={displaySourceUrl}
            >
              {shortenRecipeUrl(displaySourceUrl)}
            </a>
          )}

          <div className="flex gap-4 text-xs text-muted mb-3">
            {recipe.prep_minutes && <span>⏱ {recipe.prep_minutes} min prep</span>}
            {recipe.cook_minutes && <span>🔥 {recipe.cook_minutes} min cook</span>}
          </div>

          {(recipe.meal_types?.length > 0 || recipe.dietary_tags?.length > 0) && (
            <div className="flex flex-wrap gap-1.5 mb-3">
              {recipe.meal_types?.map((tag) => (
                <span
                  key={`meal-${tag}`}
                  className={`text-xs rounded-full px-2.5 py-0.5 border ${mealTypeBadgeClasses(tag)}`}
                >
                  {tag}
                </span>
              ))}
              {recipe.dietary_tags?.map((tag) => (
                <span
                  key={`diet-${tag}`}
                  className="text-xs bg-green-50 text-green-700 border border-green-100 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800 rounded-full px-2.5 py-0.5"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {showFreshIngredients && !selectionMode && (
            <div className="mt-3 rounded-xl border border-border bg-surface px-3 py-2.5">
              <p className="text-xs font-medium text-primary mb-1.5">Fresh ingredients needed</p>
              {freshIngredients.length > 0 ? (
                <ul className="text-xs text-muted space-y-1">
                  {freshIngredients.map((line, index) => (
                    <li key={`${recipe.id}-fresh-${index}`}>{line}</li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-muted">No fresh ingredients added yet.</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

type RecipesPageClientProps = {
  initialRecipes?: RecipeListItem[]
  initialCatalog?: CatalogIngredient[]
}

export default function Home({
  initialRecipes,
  initialCatalog,
}: RecipesPageClientProps = {}) {
  const serverPrefetched =
    initialRecipes !== undefined && initialCatalog !== undefined

  const [recipes, setRecipes] = useState<Recipe[]>(() =>
    (initialRecipes ?? []).map((recipe) => ({
      ...recipe,
      meal_types: recipe.meal_types ?? [],
      source_url: sanitizeRecipeSourceUrl(recipe.source_url),
    }))
  )
  const [recipeSort, setRecipeSort] = useState<RecipeSort>('date-desc')
  const [mealTypeFilter, setMealTypeFilter] = useState<string[]>([])
  const [loading, setLoading] = useState(() => !serverPrefetched)
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false)
  const [deletingAll, setDeletingAll] = useState(false)
  const [deleteAllError, setDeleteAllError] = useState<string | null>(null)
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedRecipeIds, setSelectedRecipeIds] = useState<Set<string>>(
    () => new Set()
  )
  const [showBatchDeleteConfirm, setShowBatchDeleteConfirm] = useState(false)
  const [batchDeleteError, setBatchDeleteError] = useState<string | null>(null)
  const [batchDeleting, setBatchDeleting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [form, setForm] = useState<RecipeFormState>(emptyForm)
  const [showAddChooser, setShowAddChooser] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importInput, setImportInput] = useState('')
  const [importing, setImporting] = useState(false)
  const [importError, setImportError] = useState<string | null>(null)
  const [pendingImports, setPendingImports] = useState<ImportedRecipe[] | null>(null)
  const [editingPendingImportIndex, setEditingPendingImportIndex] = useState<number | null>(
    null
  )
  const [batchSaving, setBatchSaving] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [ingredientCatalog, setIngredientCatalog] = useState<CatalogIngredient[]>(
    () => initialCatalog ?? []
  )
  const [catalogLoading, setCatalogLoading] = useState(() => !serverPrefetched)
  const [supportsRecipeDisplayName, setSupportsRecipeDisplayName] = useState(true)
  const [pendingRequestNames, setPendingRequestNames] = useState<Set<string>>(
    () => new Set()
  )
  const [editingRecipeLoaded, setEditingRecipeLoaded] = useState<Recipe | null>(
    null
  )
  const [restoringIngredients, setRestoringIngredients] = useState(false)
  const { user, isAdmin, loading: authLoading } = useAuth()
  const userId = user?.id

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
    if (!userId) return

    if (!serverPrefetched) {
      void loadRecipes(userId)
      fetchIngredientCatalog(supabase)
        .then(setIngredientCatalog)
        .catch((err) => console.error(err))
        .finally(() => setCatalogLoading(false))
    }

    void clearLegacyGoogleDocSourceUrls(userId)

    supabase
      .from('recipe_ingredients')
      .select('display_name')
      .limit(0)
      .then(({ error }) => {
        if (isDisplayNameSchemaError(error)) setSupportsRecipeDisplayName(false)
      })
  }, [userId, serverPrefetched])

  useEffect(() => {
    if (!editingId || !editingRecipeLoaded || ingredientCatalog.length === 0) {
      return
    }
    setForm((f) => {
      if (formHasNamedIngredients(f.ingredients)) return f
      const next = recipeToForm(editingRecipeLoaded, ingredientCatalog)
      if (!formHasNamedIngredients(next.ingredients)) return f
      return {
        ...f,
        ingredients: applyPendingRequestFlags(next.ingredients),
      }
    })
  }, [editingId, editingRecipeLoaded, ingredientCatalog])

  async function clearLegacyGoogleDocSourceUrls(uid: string) {
    const { data, error } = await supabase
      .from('recipes')
      .select('id, source_url')
      .eq('user_id', uid)

    if (error || !data?.length) return

    const ids = data
      .filter((r) => isGoogleDocSourceUrl(r.source_url))
      .map((r) => r.id)
    if (ids.length === 0) return

    const { error: updateError } = await supabase
      .from('recipes')
      .update({ source_url: null })
      .eq('user_id', uid)
      .in('id', ids)

    if (updateError) {
      console.error(updateError)
      return
    }

    setRecipes((prev) =>
      prev.map((r) => (ids.includes(r.id) ? { ...r, source_url: null } : r))
    )
  }

  async function loadRecipes(uid: string) {
    let query = supabase
      .from('recipes')
      .select(
        supportsRecipeDisplayName
          ? RECIPE_WITH_INGREDIENTS_SELECT
          : RECIPE_WITH_INGREDIENTS_SELECT_LEGACY
      )
      .eq('user_id', uid)

    let { data, error } = await query

    if (error && supportsRecipeDisplayName && isDisplayNameSchemaError(error)) {
      setSupportsRecipeDisplayName(false)
      const retry = await supabase
        .from('recipes')
        .select(RECIPE_WITH_INGREDIENTS_SELECT_LEGACY)
        .eq('user_id', uid)
      data = retry.data
      error = retry.error
    }

    if (error) {
      console.error(error)
    } else {
      setRecipes(normalizeRecipes((data ?? []) as RecipeRow[]))
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

  function toggleMealType(tag: string) {
    setForm((f) => ({
      ...f,
      meal_types: f.meal_types.includes(tag)
        ? f.meal_types.filter((t) => t !== tag)
        : [...f.meal_types, tag],
    }))
  }

  function resetImport(clearPending = true) {
    setShowImport(false)
    setImportInput('')
    setImportError(null)
    setImporting(false)
    if (clearPending) {
      setPendingImports(null)
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
    exitSelectionMode()
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

  function selectAddImport() {
    setShowAddChooser(false)
    setShowForm(false)
    setEditingId(null)
    setForm(emptyForm)
    setFormError(null)
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

  async function fetchRecipeIngredientsFallback(
    recipeId: string
  ): Promise<RecipeIngredient[]> {
    type LinkRow = NonNullable<RecipeRow['recipe_ingredients']>[number]
    let rows: LinkRow[] | null = null
    let fetchError: { message?: string } | null = null

    const first = await supabase
      .from('recipe_ingredients')
      .select(
        supportsRecipeDisplayName
          ? RECIPE_INGREDIENT_LINK_SELECT
          : RECIPE_INGREDIENT_LINK_SELECT_LEGACY
      )
      .eq('recipe_id', recipeId)
    rows = first.data as LinkRow[] | null
    fetchError = first.error

    if (
      fetchError &&
      supportsRecipeDisplayName &&
      isDisplayNameSchemaError(fetchError)
    ) {
      setSupportsRecipeDisplayName(false)
      const retry = await supabase
        .from('recipe_ingredients')
        .select(RECIPE_INGREDIENT_LINK_SELECT_LEGACY)
        .eq('recipe_id', recipeId)
      rows = retry.data as LinkRow[] | null
      fetchError = retry.error
    }

    if (fetchError || !rows?.length) return []
    return normalizeRecipeIngredientRows(rows)
  }

  async function fetchRecipeForEdit(recipeId: string): Promise<{
    recipe: Recipe | null
    loadWarning: string | null
  }> {
    let userId: string
    try {
      userId = await getAuthUserId(supabase)
    } catch {
      return { recipe: null, loadWarning: 'Not signed in.' }
    }

    const recipeSelect = supportsRecipeDisplayName
      ? RECIPE_WITH_INGREDIENTS_SELECT
      : RECIPE_WITH_INGREDIENTS_SELECT_LEGACY

    let { data, error } = await supabase
      .from('recipes')
      .select(recipeSelect)
      .eq('id', recipeId)
      .eq('user_id', userId)
      .single()

    if (error && supportsRecipeDisplayName && isDisplayNameSchemaError(error)) {
      setSupportsRecipeDisplayName(false)
      const retry = await supabase
        .from('recipes')
        .select(RECIPE_WITH_INGREDIENTS_SELECT_LEGACY)
        .eq('id', recipeId)
        .eq('user_id', userId)
        .single()
      data = retry.data
      error = retry.error
    }

    if (error || !data) {
      return {
        recipe: null,
        loadWarning: error?.message ?? 'Could not load recipe for editing.',
      }
    }

    let loaded = normalizeRecipes([data])[0]

    if (loaded.recipe_ingredients.length === 0) {
      const fallback = await fetchRecipeIngredientsFallback(recipeId)
      if (fallback.length > 0) {
        loaded = { ...loaded, recipe_ingredients: fallback }
      }
    }

    const linksLoaded = loaded.recipe_ingredients.length > 0

    let loadWarning: string | null = null
    if (!linksLoaded) {
      loadWarning = loaded.source_url?.trim()
        ? 'No ingredients loaded. Use “Restore ingredients from URL” below, then Update recipe — do not save an empty form.'
        : 'No ingredients loaded. Run docs/supabase-recipe-ingredients-diagnostic.sql in Supabase.'
    }

    return { recipe: loaded, loadWarning }
  }

  async function ensureIngredientCatalog(): Promise<CatalogIngredient[]> {
    if (ingredientCatalog.length > 0) return ingredientCatalog
    const catalog = await fetchIngredientCatalog(supabase)
    setIngredientCatalog(catalog)
    setCatalogLoading(false)
    return catalog
  }

  function applyImportedToFormFields(imported: ImportedRecipe, catalog: CatalogIngredient[]) {
    const fields = importedToFormFields(imported)
    const classified = classifyIngredientRows(
      fields.ingredients.filter((i) => i.name.trim()),
      catalog
    )
    return { fields, classified }
  }

  async function restoreIngredientsFromSource() {
    const sourceRaw = form.source_url.trim()
    if (!sourceRaw) {
      setFormError('Add a source link before restoring ingredients.')
      return
    }

    const websiteUrl = normalizeImportUrl(sourceRaw)
    if (!websiteUrl) {
      setFormError('Add a valid source URL before restoring ingredients.')
      return
    }

    setRestoringIngredients(true)
    setFormError(null)
    try {
      const catalog = await ensureIngredientCatalog()
      const res = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: websiteUrl }),
      })
      const body = (await res.json()) as { recipe?: ImportedRecipe; error?: string }
      if (!res.ok || !body.recipe) {
        setFormError(body.error ?? 'Could not fetch ingredients from that URL.')
        return
      }
      const imported = body.recipe

      const { fields, classified } = applyImportedToFormFields(imported, catalog)
      if (classified.length === 0) {
        setFormError('No ingredients found to restore.')
        return
      }

      setForm((f) => ({
        ...f,
        ingredients: applyPendingRequestFlags(classified),
        instructions: f.instructions.trim() ? f.instructions : fields.instructions,
        prep_minutes: f.prep_minutes.trim() ? f.prep_minutes : fields.prep_minutes,
        cook_minutes: f.cook_minutes.trim() ? f.cook_minutes : fields.cook_minutes,
      }))
      setFormError('Ingredients restored from URL — review them, then click Update recipe to save.')
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Restore failed.')
    } finally {
      setRestoringIngredients(false)
    }
  }

  async function openEditForm(recipe: Recipe) {
    exitSelectionMode()
    setFormError(null)
    setEditingRecipeLoaded(null)

    const { recipe: loaded, loadWarning } = await fetchRecipeForEdit(recipe.id)

    if (!loaded) {
      setFormError(loadWarning ?? 'Could not load recipe for editing.')
      return
    }

    const catalog = await ensureIngredientCatalog()
    setShowForm(false)
    setEditingId(recipe.id)
    setEditingRecipeLoaded(loaded)
    const nextForm = recipeToForm(loaded, catalog)
    setForm({
      ...nextForm,
      ingredients: applyPendingRequestFlags(nextForm.ingredients),
    })
    if (loadWarning && !formHasNamedIngredients(nextForm.ingredients)) {
      setFormError(loadWarning)
    }
  }

  function cancelForm() {
    if (editingPendingImportIndex !== null) {
      cancelPendingImportEdit()
      return
    }
    exitSelectionMode()
    setEditingRecipeLoaded(null)
    setRestoringIngredients(false)
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
    (pendingImports != null && pendingImports.length > 0)

  async function handleImport() {
    setImportError(null)
    if (!importInput.trim()) {
      setImportError('Paste a recipe URL.')
      return
    }

    setImporting(true)
    try {
      const res = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: importInput.trim() }),
      })
      const data = await res.json()
      if (!res.ok) {
        setImportError(data.error ?? 'Import failed.')
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
    const classified = classifyIngredientLineRelaxed(matchText, ingredientCatalog)
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

    const { count, error: countError } = await supabase
      .from('recipe_ingredients')
      .select('*', { count: 'exact', head: true })
      .eq('recipe_id', recipeId)

    if (
      !countError &&
      (count ?? 0) > 0 &&
      validIngredients.length === 0
    ) {
      return (
        'Ingredient links exist in the database but none are shown in the form. ' +
        'Reload and try again — saving now would erase your recipe ingredients.'
      )
    }

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
    let userId: string
    try {
      userId = await getAuthUserId(supabase)
    } catch {
      return 'Not signed in.'
    }

    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        user_id: userId,
        name: imported.name.trim(),
        prep_minutes: imported.prep_minutes ? parseInt(imported.prep_minutes) : null,
        cook_minutes: imported.cook_minutes ? parseInt(imported.cook_minutes) : null,
        instructions: imported.instructions.trim() || null,
        dietary_tags: [],
        meal_types: [],
        source_url: sanitizeRecipeSourceUrl(imported.source_url),
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
        if (userId) void loadRecipes(userId)
        return
      }
      saved++
    }

    setPendingImports(null)
    setBatchSaving(false)
    if (userId) void loadRecipes(userId)
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

    let userId: string
    try {
      userId = await getAuthUserId(supabase)
    } catch {
      setFormError('Not signed in.')
      setSaving(false)
      return
    }

    const { data: recipeData, error: recipeError } = await supabase
      .from('recipes')
      .insert({
        user_id: userId,
        name: form.name.trim(),
        prep_minutes: form.prep_minutes ? parseInt(form.prep_minutes) : null,
        cook_minutes: form.cook_minutes ? parseInt(form.cook_minutes) : null,
        instructions: form.instructions.trim() || null,
        dietary_tags: form.dietary_tags,
        meal_types: form.meal_types,
        source_url: sanitizeRecipeSourceUrl(form.source_url),
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
    if (userId) void loadRecipes(userId)
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
        prep_minutes: form.prep_minutes ? parseInt(form.prep_minutes) : null,
        cook_minutes: form.cook_minutes ? parseInt(form.cook_minutes) : null,
        instructions: form.instructions.trim() || null,
        dietary_tags: form.dietary_tags,
        meal_types: form.meal_types,
        source_url: sanitizeRecipeSourceUrl(form.source_url),
      })
      .eq('id', editingId)
      .eq('user_id', user?.id ?? '')

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
      .eq('user_id', user?.id ?? '')
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

    const err = await deleteRecipesByIds([editingId])
    if (err) {
      setFormError(err)
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

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedRecipeIds(new Set())
    setBatchDeleteError(null)
    setShowBatchDeleteConfirm(false)
  }

  function enterSelectionMode(recipeId: string) {
    if (editingId && editingId !== recipeId) cancelForm()
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40)
    }
    setSelectionMode(true)
    setSelectedRecipeIds(new Set([recipeId]))
  }

  function toggleRecipeSelection(recipeId: string) {
    setSelectedRecipeIds((prev) => {
      const next = new Set(prev)
      if (next.has(recipeId)) next.delete(recipeId)
      else next.add(recipeId)
      return next
    })
  }

  async function deleteRecipesByIds(ids: string[]): Promise<string | null> {
    if (ids.length === 0) return null

    let userId: string
    try {
      userId = await getAuthUserId(supabase)
    } catch {
      return 'Not signed in.'
    }

    const { data: deleted, error: recipeError } = await supabase
      .from('recipes')
      .delete()
      .eq('user_id', userId)
      .in('id', ids)
      .select('id')

    if (recipeError) {
      return recipeError.message ?? 'Failed to delete recipes.'
    }

    if (!deleted?.length) {
      return (
        'Recipes could not be deleted (check user_id on recipes and docs/supabase-enable-delete.sql). ' +
        'Ingredient links were not removed first, so your data should still be intact.'
      )
    }

    const deletedIds = deleted.map((r) => r.id)
    const { error: linksError } = await supabase
      .from('recipe_ingredients')
      .delete()
      .in('recipe_id', deletedIds)

    if (linksError) {
      return `Recipes deleted but ingredient cleanup failed: ${linksError.message}`
    }

    return null
  }

  async function confirmDeleteAll() {
    if (recipes.length === 0) return

    setDeleteAllError(null)
    setDeletingAll(true)
    const ids = recipes.map((r) => r.id)
    const err = await deleteRecipesByIds(ids)

    if (err) {
      setDeleteAllError(err)
      setDeletingAll(false)
      return
    }

    setShowDeleteAllConfirm(false)
    cancelForm()
    exitSelectionMode()
    setDeletingAll(false)
    setRecipes([])
    if (userId) void loadRecipes(userId)
  }

  function requestBatchDelete() {
    if (selectedRecipeIds.size === 0) return
    setBatchDeleteError(null)
    setShowBatchDeleteConfirm(true)
  }

  function cancelBatchDeleteConfirm() {
    setShowBatchDeleteConfirm(false)
    setBatchDeleteError(null)
  }

  async function confirmBatchDelete() {
    const ids = [...selectedRecipeIds]
    if (ids.length === 0) return

    setBatchDeleteError(null)
    setBatchDeleting(true)
    const err = await deleteRecipesByIds(ids)

    if (err) {
      setBatchDeleteError(err)
      setBatchDeleting(false)
      return
    }

    setShowBatchDeleteConfirm(false)
    cancelForm()
    const idSet = new Set(ids)
    setRecipes((prev) => prev.filter((r) => !idSet.has(r.id)))
    exitSelectionMode()
    setBatchDeleting(false)
  }

  const filteredRecipes = useMemo(
    () => recipes.filter((r) => recipeMatchesMealTypeFilter(r.meal_types, mealTypeFilter)),
    [recipes, mealTypeFilter]
  )

  const sortedRecipes = useMemo(
    () => sortRecipes(filteredRecipes, recipeSort),
    [filteredRecipes, recipeSort]
  )

  const formPanelProps = {
    form,
    formError,
    saving,
    onNameChange: (value: string) => setForm(f => ({ ...f, name: value })),
    onPrepChange: (value: string) => setForm(f => ({ ...f, prep_minutes: value })),
    onCookChange: (value: string) => setForm(f => ({ ...f, cook_minutes: value })),
    onInstructionsChange: (value: string) => setForm(f => ({ ...f, instructions: value })),
    onToggleTag: toggleTag,
    onToggleMealType: toggleMealType,
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

  const selectedCount = selectedRecipeIds.size

  return (
    <main
      className={`max-w-2xl mx-auto px-4 sm:px-6 py-10 min-w-0 w-full overflow-x-hidden ${selectionMode ? 'pb-24' : ''}`}
    >
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className={`text-2xl font-semibold text-primary ${pageTitleAccent}`}>
          📚 Recipe bank
        </h1>
        <button
          type="button"
          onClick={() => (isAddingRecipe ? cancelForm() : openAddChooser())}
          className={`shrink-0 ${btnPrimary} px-4 py-2`}
        >
          {isAddingRecipe ? 'Cancel' : '+ Add recipe'}
        </button>
      </div>
      <p className={`text-sm ${textMuted} mb-8`}>
        Your saved family recipes
        {!loading && recipes.length > 0 && !selectionMode && (
          <span className="block mt-1">
            Press and hold a recipe to select several for batch delete.
          </span>
        )}
      </p>

      {showAddChooser && (
        <div className="surface-card p-4 sm:p-6 mb-6 flex flex-col gap-4 min-w-0 max-w-full overflow-hidden">
          <h2 className="text-base font-semibold text-primary">Add recipe</h2>
          <p className="text-sm text-muted">
            Choose how you want to add your recipe.
          </p>
          <div className="flex flex-col gap-2">
            <button
              type="button"
              onClick={selectAddManual}
              className="text-left text-sm font-medium border border-border text-primary rounded-lg px-4 py-3 hover:border-muted transition-colors"
            >
              Enter manually
              <span className="block text-xs font-normal text-muted mt-0.5">
                Fill in the recipe form yourself
              </span>
            </button>
            <button
              type="button"
              onClick={selectAddImport}
              className="text-left text-sm font-medium border border-border text-primary rounded-lg px-4 py-3 hover:border-muted transition-colors"
            >
              Import from URL
              <span className="block text-xs font-normal text-muted mt-0.5">
                Paste a link from a recipe website
              </span>
            </button>
          </div>
        </div>
      )}

      {showImport && (
        <div className="surface-card p-4 sm:p-6 mb-6 flex flex-col gap-4 min-w-0 max-w-full overflow-hidden">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-semibold text-primary">Import from URL</h2>
            <button
              type="button"
              onClick={backToAddChooser}
              className="text-sm text-muted hover:text-gray-700 dark:hover:text-gray-200 shrink-0"
            >
              ← Back
            </button>
          </div>
          <p className="text-sm text-muted">
            Paste a link from a recipe site.
          </p>
          <input
            type="url"
            value={importInput}
            onChange={(e) => setImportInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !importing && handleImport()}
            placeholder="https://www.recipetineats.com/lentil-soup/"
            className={inputClass}
            disabled={importing}
          />
          {importError && <p className="text-red-500 text-sm">{importError}</p>}
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50 transition-colors"
          >
            {importing ? 'Importing...' : 'Import recipe'}
          </button>
        </div>
      )}

      {pendingImports && pendingImports.length > 0 && (
        <div className="surface-card p-6 mb-6 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-primary">
            {pendingImports.length} recipe{pendingImports.length === 1 ? '' : 's'} to import
          </h2>
          <p className="text-sm text-muted">
            Review below, then save or open one to edit before saving.
          </p>
          <ul className="flex flex-col gap-2">
            {pendingImports.map((recipe, index) => (
              <li
                key={`${recipe.name}-${index}`}
                className={`flex items-center justify-between gap-3 border rounded-lg px-4 py-3 ${
                  editingPendingImportIndex === index
                    ? 'border-gray-400 dark:border-gray-500 bg-surface'
                    : 'border-gray-100 dark:border-gray-800'
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-primary truncate">
                    {recipe.name}
                  </p>
                  <p className="text-xs text-muted">
                    {recipe.ingredients.filter((i) => i.name.trim()).length} ingredients
                    {recipe.instructions.trim() ? ' · method included' : ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => openPendingForEdit(index)}
                  className="shrink-0 text-sm text-primary/80 hover:text-gray-900 dark:hover:text-gray-100"
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
              className="btn-primary px-4 py-2.5 text-sm disabled:opacity-50 transition-colors"
            >
              {batchSaving
                ? 'Saving...'
                : `Save ${pendingImports.length} recipe${pendingImports.length === 1 ? '' : 's'}`}
            </button>
            <button
              type="button"
              onClick={() => resetImport(true)}
              disabled={batchSaving}
              className="border border-border text-gray-700 dark:text-gray-200 rounded-lg px-4 py-2.5 text-sm font-medium hover:border-muted disabled:opacity-50 transition-colors"
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
        <div className="mb-6 min-w-0 max-w-full">
          <div className="flex justify-end mb-2">
            <button
              type="button"
              onClick={backToAddChooser}
              className="text-sm text-muted hover:text-gray-700 dark:hover:text-gray-200"
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
      {loading && <p className="text-muted text-sm">Loading recipes...</p>}

      {!loading && recipes.length > 0 && (
        <div className="flex flex-col gap-4 mb-4 min-w-0">
          <MealTypeFilterBar selected={mealTypeFilter} onChange={setMealTypeFilter} />
          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <label
              htmlFor="recipe-sort"
              className="text-sm text-muted shrink-0"
            >
              Sort by
            </label>
            <select
              id="recipe-sort"
              value={recipeSort}
              onChange={(e) => setRecipeSort(e.target.value as RecipeSort)}
              className={`${inputClass} sm:max-w-xs`}
            >
              {RECIPE_SORT_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}

      {!loading && recipes.length > 0 && sortedRecipes.length === 0 && (
        <p className="text-sm text-muted mb-4">
          No recipes match the selected meal types. Choose &ldquo;All&rdquo; or another filter.
        </p>
      )}

      <div className="flex flex-col gap-3">
        {sortedRecipes.map((recipe) =>
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
              onRestoreIngredientsFromSource={restoreIngredientsFromSource}
              restoringIngredients={restoringIngredients}
            />
          ) : (
            <RecipeBankCard
              key={recipe.id}
              recipe={recipe}
              selectionMode={selectionMode}
              selected={selectedRecipeIds.has(recipe.id)}
              onToggleSelect={() => toggleRecipeSelection(recipe.id)}
              onEnterSelection={() => {
                if (!selectionMode) enterSelectionMode(recipe.id)
              }}
              onEdit={() => openEditForm(recipe)}
            />
          )
        )}
      </div>

      {!loading && recipes.length > 0 && !selectionMode && (
        <div className="mt-8 pt-6 border-t border-border">
          <button
            type="button"
            onClick={requestDeleteAll}
            disabled={deletingAll || deleting || batchDeleting}
            className="w-full text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 transition-colors"
          >
            Delete all recipes
          </button>
        </div>
      )}

      {selectionMode && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t border-border bg-base/95 backdrop-blur-sm px-4 py-3">
          <div className="max-w-2xl mx-auto flex items-center gap-3">
            <button
              type="button"
              onClick={exitSelectionMode}
              disabled={batchDeleting}
              className="text-sm text-muted hover:text-gray-700 dark:hover:text-gray-200 disabled:opacity-50 shrink-0"
            >
              Cancel
            </button>
            <p className="flex-1 text-sm text-primary text-center">
              {selectedCount} selected
            </p>
            <button
              type="button"
              onClick={requestBatchDelete}
              disabled={selectedCount === 0 || batchDeleting}
              className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 disabled:opacity-50 shrink-0"
            >
              Delete
            </button>
          </div>
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
            <span className="font-medium text-primary">
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
            <span className="font-medium text-primary">
              {recipes.length} recipe{recipes.length === 1 ? '' : 's'}
            </span>{' '}
            in your recipe bank. This cannot be undone.
          </p>
        </DeleteConfirmDialog>
      )}

      {showBatchDeleteConfirm && (
        <DeleteConfirmDialog
          title={
            selectedCount === 1 ? 'Delete recipe?' : `Delete ${selectedCount} recipes?`
          }
          error={batchDeleteError}
          deleting={batchDeleting}
          onConfirm={confirmBatchDelete}
          onCancel={cancelBatchDeleteConfirm}
          confirmLabel={selectedCount === 1 ? 'Delete' : `Delete ${selectedCount}`}
        >
          <p>
            This will permanently delete{' '}
            <span className="font-medium text-primary">
              {selectedCount} recipe{selectedCount === 1 ? '' : 's'}
            </span>
            . This cannot be undone.
          </p>
        </DeleteConfirmDialog>
      )}
    </main>
  )
}