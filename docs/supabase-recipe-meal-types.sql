-- Meal type tags on recipes (Dinner, Snack, Dessert) — same pattern as dietary_tags.
-- Run in Supabase SQL editor, then wait a few seconds (or Settings → API → Reload schema).

ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS meal_types text[] NOT NULL DEFAULT '{}';
