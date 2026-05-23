import type { SupabaseClient } from '@supabase/supabase-js'
import {
  createIngredientInBank,
  type IngredientBankCategory,
} from './ingredient-catalog'

export type IngredientRequestStatus = 'pending' | 'approved' | 'rejected'

export type IngredientRequest = {
  id: string
  requested_name: string
  category: IngredientBankCategory
  recipe_line: string | null
  status: IngredientRequestStatus
  created_at: string
  resolved_at: string | null
  resolved_ingredient_id: string | null
}

function normalizeRequestName(name: string): string {
  return name.trim().toLowerCase()
}

export async function createIngredientRequest(
  supabase: SupabaseClient,
  requestedName: string,
  category: IngredientBankCategory,
  recipeLine?: string | null
): Promise<{ request: IngredientRequest } | { error: string }> {
  const name = requestedName.trim().toLowerCase()
  if (!name) return { error: 'Ingredient name is required.' }

  const { data: existing, error: lookupError } = await supabase
    .from('ingredient_requests')
    .select('id')
    .eq('status', 'pending')
    .ilike('requested_name', name)
    .maybeSingle()

  if (lookupError) {
    return { error: lookupError.message ?? 'Could not check existing requests.' }
  }
  if (existing) {
    return { error: 'This ingredient is already waiting for admin approval.' }
  }

  const { data, error } = await supabase
    .from('ingredient_requests')
    .insert({
      requested_name: name,
      category,
      recipe_line: recipeLine?.trim() || null,
      status: 'pending',
    })
    .select(
      'id, requested_name, category, recipe_line, status, created_at, resolved_at, resolved_ingredient_id'
    )
    .single()

  if (error || !data) {
    return { error: error?.message ?? 'Failed to submit request.' }
  }

  return { request: data as IngredientRequest }
}

export async function fetchPendingIngredientRequests(
  supabase: SupabaseClient
): Promise<IngredientRequest[]> {
  const { data, error } = await supabase
    .from('ingredient_requests')
    .select(
      'id, requested_name, category, recipe_line, status, created_at, resolved_at, resolved_ingredient_id'
    )
    .eq('status', 'pending')
    .order('created_at', { ascending: true })

  if (error) throw error
  return (data ?? []) as IngredientRequest[]
}

export async function fetchPendingIngredientRequestNames(
  supabase: SupabaseClient
): Promise<Set<string>> {
  const { data, error } = await supabase
    .from('ingredient_requests')
    .select('requested_name')
    .eq('status', 'pending')

  if (error) throw error
  return new Set((data ?? []).map((r) => normalizeRequestName(r.requested_name)))
}

export async function approveIngredientRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<{ error: string } | { ingredientId: string }> {
  const { data: request, error: fetchError } = await supabase
    .from('ingredient_requests')
    .select('id, requested_name, category, status')
    .eq('id', requestId)
    .single()

  if (fetchError || !request) {
    return { error: fetchError?.message ?? 'Request not found.' }
  }
  if (request.status !== 'pending') {
    return { error: 'This request was already resolved.' }
  }

  const created = await createIngredientInBank(
    supabase,
    request.requested_name,
    request.category as IngredientBankCategory
  )
  if ('error' in created) return { error: created.error }

  const { error: updateError } = await supabase
    .from('ingredient_requests')
    .update({
      status: 'approved',
      resolved_at: new Date().toISOString(),
      resolved_ingredient_id: created.ingredient.id,
    })
    .eq('id', requestId)

  if (updateError) {
    return { error: updateError.message ?? 'Ingredient added but request not updated.' }
  }

  return { ingredientId: created.ingredient.id }
}

export async function rejectIngredientRequest(
  supabase: SupabaseClient,
  requestId: string
): Promise<{ error: string } | { ok: true }> {
  const { error } = await supabase
    .from('ingredient_requests')
    .update({
      status: 'rejected',
      resolved_at: new Date().toISOString(),
    })
    .eq('id', requestId)
    .eq('status', 'pending')

  if (error) return { error: error.message ?? 'Failed to reject request.' }
  return { ok: true }
}

export { normalizeRequestName }
