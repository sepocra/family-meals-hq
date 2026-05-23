-- Per-recipe ingredient line text (import detail) while ingredient_id links the bank row.
-- Run in Supabase SQL editor, then wait a few seconds (or Settings → API → Reload schema).

ALTER TABLE recipe_ingredients
  ADD COLUMN IF NOT EXISTS display_name text;
