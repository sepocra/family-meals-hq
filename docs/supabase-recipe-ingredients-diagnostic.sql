-- Run in Supabase SQL editor (runs as postgres — sees true row counts, ignores RLS).

SELECT
  r.id,
  r.name,
  r.user_id,
  r.source_url,
  COUNT(ri.recipe_id) AS ingredient_link_count
FROM public.recipes r
LEFT JOIN public.recipe_ingredients ri ON ri.recipe_id = r.id
GROUP BY r.id, r.name, r.user_id, r.source_url
ORDER BY ingredient_link_count ASC, r.name;

-- ingredient_link_count = 0  →  links were deleted; use app “Restore from URL” or re-import.
-- ingredient_link_count > 0 but app still empty  →  run supabase-recipe-ingredients-rls-fix.sql
--   and supabase-ingredients-read-fix.sql, then hard-refresh the app.
-- user_id IS NULL  →  assign to your account (see bottom of supabase-recipe-ingredients-rls-fix.sql).
