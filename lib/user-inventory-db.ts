import type { SupabaseClient } from '@supabase/supabase-js'
import { getAuthUserId } from './auth-user'
import type { FreshInventoryItem } from './fresh-inventory'
import type { InventoryCategory } from './ingredient-category'

type InventoryRow = {
  id: string
  name: string
  category: InventoryCategory
  quantity: string | null
  added_at: string
}

function rowToItem(row: InventoryRow): FreshInventoryItem {
  return {
    id: row.id,
    name: row.name,
    addedAt: row.added_at,
    category: row.category,
    quantity: row.quantity?.trim() || undefined,
  }
}

export async function fetchUserFreshInventory(
  supabase: SupabaseClient
): Promise<FreshInventoryItem[]> {
  const userId = await getAuthUserId(supabase)

  const { data, error } = await supabase
    .from('fresh_inventory_items')
    .select('id, name, category, quantity, added_at')
    .eq('user_id', userId)
    .order('added_at', { ascending: false })

  if (error) throw error
  return (data ?? []).map((row) => rowToItem(row as InventoryRow))
}

export async function replaceUserFreshInventory(
  supabase: SupabaseClient,
  items: FreshInventoryItem[]
): Promise<void> {
  const userId = await getAuthUserId(supabase)

  const { error: deleteError } = await supabase
    .from('fresh_inventory_items')
    .delete()
    .eq('user_id', userId)

  if (deleteError) throw deleteError

  if (items.length === 0) return

  const { error: insertError } = await supabase.from('fresh_inventory_items').insert(
    items.map((item) => ({
      user_id: userId,
      name: item.name.trim(),
      category: item.category,
      quantity: item.quantity?.trim() || null,
      added_at: item.addedAt,
    }))
  )

  if (insertError) throw insertError
}
