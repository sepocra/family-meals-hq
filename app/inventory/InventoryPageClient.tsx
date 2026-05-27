'use client'

import { useEffect, useState } from 'react'
import type { InventoryCategory } from '../../lib/ingredient-category'
import {
  formatAddedDate,
  normalizeProduceName,
  todayDateString,
  type FreshInventoryItem,
} from '../../lib/fresh-inventory'
import {
  fetchUserFreshInventory,
  replaceUserFreshInventory,
} from '../../lib/user-inventory-db'
import { btnPrimary, fieldInput, pageTitleAccent, surfaceCard, textMuted } from '../../lib/brand-classes'
import { supabase } from '../../lib/supabase'

const inputClass = fieldInput
const qtyInputClass = `${fieldInput} px-2 min-w-0`

const CATEGORY_LABELS: Record<InventoryCategory, string> = {
  produce: 'Fruit & veg',
  meat: 'Meat',
}

type AddInventoryBoxProps = {
  title: string
  namePlaceholder: string
  draftName: string
  draftQty: string
  onDraftNameChange: (value: string) => void
  onDraftQtyChange: (value: string) => void
  onAdd: () => void
}

function AddInventoryBox({
  title,
  namePlaceholder,
  draftName,
  draftQty,
  onDraftNameChange,
  onDraftQtyChange,
  onAdd,
}: AddInventoryBoxProps) {
  return (
    <div className={`${surfaceCard} p-5 flex flex-col gap-3`}>
      <h2 className="text-sm font-semibold text-gray-900 dark:text-gray-100">{title}</h2>
      <div className="flex gap-2">
        <input
          type="text"
          value={draftName}
          onChange={(e) => onDraftNameChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onAdd()}
          placeholder={namePlaceholder}
          className={`flex-1 min-w-0 ${inputClass}`}
        />
        <button
          type="button"
          onClick={onAdd}
          className={`shrink-0 ${btnPrimary} px-3 py-2`}
        >
          Add
        </button>
      </div>
      <input
        type="text"
        value={draftQty}
        onChange={(e) => onDraftQtyChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onAdd()}
        placeholder="Quantity (optional)"
        aria-label="Quantity (optional)"
        className={qtyInputClass}
      />
    </div>
  )
}

type InventoryPageClientProps = {
  initialItems?: FreshInventoryItem[]
}

export default function FreshInventoryPage({
  initialItems,
}: InventoryPageClientProps = {}) {
  const [items, setItems] = useState<FreshInventoryItem[]>(() => initialItems ?? [])
  const [draftProduce, setDraftProduce] = useState('')
  const [draftProduceQty, setDraftProduceQty] = useState('')
  const [draftMeat, setDraftMeat] = useState('')
  const [draftMeatQty, setDraftMeatQty] = useState('')
  const [hydrated, setHydrated] = useState(initialItems !== undefined)
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [listOpen, setListOpen] = useState(true)

  useEffect(() => {
    if (initialItems !== undefined) return

    fetchUserFreshInventory(supabase)
      .then(setItems)
      .catch((err) => {
        console.error(err)
        setLoadError(
          'Could not load inventory. Run docs/supabase-multi-user.sql (or supabase-multi-user-fix.sql) in Supabase.'
        )
      })
      .finally(() => setHydrated(true))
  }, [initialItems])

  async function persist(next: FreshInventoryItem[]) {
    setItems(next)
    setSaving(true)
    try {
      await replaceUserFreshInventory(supabase, next)
      setLoadError(null)
    } catch (err) {
      console.error(err)
      setLoadError(
        'Failed to save inventory. Run docs/supabase-multi-user-fix.sql in Supabase if this is a new account.'
      )
    }
    setSaving(false)
  }

  function addItem(
    category: InventoryCategory,
    nameDraft: string,
    qtyDraft: string,
    clearDrafts: () => void
  ) {
    const name = nameDraft.trim()
    if (!name) return
    const quantity = qtyDraft.trim() || undefined
    const key = normalizeProduceName(name)
    const today = todayDateString()
    const existingIndex = items.findIndex(
      (i) => i.category === category && normalizeProduceName(i.name) === key
    )

    if (existingIndex >= 0) {
      const updated = [...items]
      updated[existingIndex] = {
        name: items[existingIndex].name,
        addedAt: today,
        category,
        quantity,
      }
      persist(updated)
    } else {
      persist([...items, { name, addedAt: today, category, quantity }])
    }
    clearDrafts()
    setListOpen(true)
  }

  function removeItem(target: FreshInventoryItem) {
    persist(items.filter((i) => i !== target))
  }

  function clearAll() {
    persist([])
    setShowClearConfirm(false)
  }

  const sortedItems = [...items].sort((a, b) => a.addedAt.localeCompare(b.addedAt))

  return (
    <main className="max-w-2xl mx-auto px-6 py-10">
      <div className="flex items-start justify-between gap-4 mb-1">
        <h1 className={`text-2xl font-semibold text-primary ${pageTitleAccent}`}>
          Fresh Inventory
        </h1>
        {hydrated && items.length > 0 && (
          <div className="shrink-0">
            {showClearConfirm ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600 dark:text-gray-300">Clear all?</span>
                <button
                  type="button"
                  onClick={() => setShowClearConfirm(false)}
                  className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
                >
                  Clear all
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setShowClearConfirm(true)}
                className="text-sm font-medium text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300"
              >
                Clear all
              </button>
            )}
          </div>
        )}
      </div>
      <p className={`text-sm ${textMuted} mb-4`}>
        What fresh produce have you got to use? We assume everything other than fruit, veg and meat
        is a pantry staple.
      </p>
      {loadError && <p className="text-sm text-red-500 mb-4">{loadError}</p>}
      {saving && (
        <p className="text-xs text-gray-400 mb-4">Saving…</p>
      )}

      {!hydrated ? (
        <p className="text-gray-400 dark:text-gray-500 text-sm">Loading...</p>
      ) : (
        <div className="flex flex-col gap-4">
          <AddInventoryBox
            title="Fruit & Veg"
            namePlaceholder="e.g. carrots"
            draftName={draftProduce}
            draftQty={draftProduceQty}
            onDraftNameChange={setDraftProduce}
            onDraftQtyChange={setDraftProduceQty}
            onAdd={() =>
              addItem('produce', draftProduce, draftProduceQty, () => {
                setDraftProduce('')
                setDraftProduceQty('')
              })
            }
          />
          <AddInventoryBox
            title="Meats"
            namePlaceholder="e.g. chicken"
            draftName={draftMeat}
            draftQty={draftMeatQty}
            onDraftNameChange={setDraftMeat}
            onDraftQtyChange={setDraftMeatQty}
            onAdd={() =>
              addItem('meat', draftMeat, draftMeatQty, () => {
                setDraftMeat('')
                setDraftMeatQty('')
              })
            }
          />

          <div className={`${surfaceCard} overflow-hidden`}>
            <button
              type="button"
              onClick={() => setListOpen((open) => !open)}
              className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              aria-expanded={listOpen}
            >
              <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                What you have
                {items.length > 0 ? (
                  <span className="font-normal text-gray-500 dark:text-gray-400">
                    {' '}
                    ({items.length})
                  </span>
                ) : null}
              </span>
              <span
                className={`text-gray-400 dark:text-gray-500 text-xs transition-transform ${listOpen ? 'rotate-180' : ''}`}
                aria-hidden
              >
                ▼
              </span>
            </button>
            {listOpen && (
              <div className="px-5 pb-5 border-t border-gray-100 dark:border-gray-800">
                {sortedItems.length === 0 ? (
                  <p className="text-sm text-gray-500 dark:text-gray-400 pt-4">
                    Nothing listed yet. Add items above.
                  </p>
                ) : (
                  <ul className="flex flex-col gap-2 pt-4">
                    {sortedItems.map((item) => (
                      <li
                        key={`${item.category}-${item.name}-${item.addedAt}`}
                        className="flex items-center justify-between gap-2 border border-gray-100 dark:border-gray-800 rounded-lg px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">
                            {item.name}
                            {item.quantity ? (
                              <span className="font-normal text-gray-500 dark:text-gray-400">
                                {' '}
                                ({item.quantity})
                              </span>
                            ) : null}
                          </p>
                          <p className="text-xs text-gray-400 dark:text-gray-500">
                            <span className="text-gray-500 dark:text-gray-400">
                              {CATEGORY_LABELS[item.category]}
                            </span>
                            {' · '}
                            {formatAddedDate(item.addedAt)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item)}
                          aria-label={`Remove ${item.name}`}
                          className="shrink-0 text-gray-400 hover:text-red-500 dark:text-gray-500 dark:hover:text-red-400 w-7 h-7 rounded flex items-center justify-center"
                        >
                          ×
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <p className="text-xs text-gray-400 dark:text-gray-500 mt-6">
        New items are stamped with today&apos;s date ({todayDateString()}).
      </p>
    </main>
  )
}
