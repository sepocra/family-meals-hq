import type { InventoryCategory } from './ingredient-category'

const STORAGE_KEY = 'family-meals-fresh-inventory'

export type FreshInventoryItem = {
  name: string
  /** ISO date YYYY-MM-DD (local calendar day when added) */
  addedAt: string
  category: InventoryCategory
  /** Optional amount on hand, e.g. 500g, 2 fillets */
  quantity?: string
}

export function todayDateString(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function formatAddedDate(addedAt: string): string {
  const today = todayDateString()
  if (addedAt === today) return 'Added today'

  const added = new Date(`${addedAt}T12:00:00`)
  const now = new Date()
  now.setHours(12, 0, 0, 0)
  const diffDays = Math.round((now.getTime() - added.getTime()) / 86_400_000)

  if (diffDays === 1) return 'Added yesterday'
  if (diffDays > 1 && diffDays < 7) return `Added ${diffDays} days ago`
  if (diffDays >= 7 && diffDays < 14) return 'Added 1 week ago'
  if (diffDays >= 14 && diffDays < 21) return 'Added 2 weeks ago'

  return `Added ${added.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: added.getFullYear() !== now.getFullYear() ? 'numeric' : undefined })}`
}

function parseStoredItems(raw: string | null): FreshInventoryItem[] {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []

    const today = todayDateString()
    const items: FreshInventoryItem[] = []

    for (const entry of parsed) {
      if (typeof entry === 'string' && entry.trim()) {
        items.push({ name: entry.trim(), addedAt: today, category: 'produce' })
        continue
      }
      if (entry && typeof entry === 'object' && typeof entry.name === 'string') {
        const name = entry.name.trim()
        const addedAt =
          typeof entry.addedAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(entry.addedAt)
            ? entry.addedAt
            : today
        const category = entry.category === 'meat' ? 'meat' : 'produce'
        const quantity =
          typeof entry.quantity === 'string' && entry.quantity.trim()
            ? entry.quantity.trim()
            : undefined
        if (name) items.push({ name, addedAt, category, quantity })
      }
    }
    return items
  } catch {
    return []
  }
}

export function getFreshInventory(): FreshInventoryItem[] {
  if (typeof window === 'undefined') return []
  return parseStoredItems(localStorage.getItem(STORAGE_KEY))
}

export function getFreshInventoryByCategory(
  category: InventoryCategory
): FreshInventoryItem[] {
  return getFreshInventory().filter((item) => item.category === category)
}

export function getFreshInventoryNames(): string[] {
  return getFreshInventory().map((item) => item.name)
}

export function setFreshInventory(items: FreshInventoryItem[]): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
}

export function normalizeProduceName(name: string): string {
  return name.toLowerCase().trim()
}
