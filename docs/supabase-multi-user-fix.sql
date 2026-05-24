-- Fix: ensure old public policies are removed and per-user RLS is active.
-- Run if new users still see all recipes or cannot save inventory.

-- Recipes — drop legacy public policies
DROP POLICY IF EXISTS "Public read recipes" ON recipes;
DROP POLICY IF EXISTS "Public insert recipes" ON recipes;
DROP POLICY IF EXISTS "Public update recipes" ON recipes;
DROP POLICY IF EXISTS "Public delete recipes" ON public.recipes;

-- Re-apply per-user policies (safe if already exist — drop first)
DROP POLICY IF EXISTS "Users read own recipes" ON recipes;
DROP POLICY IF EXISTS "Users insert own recipes" ON recipes;
DROP POLICY IF EXISTS "Users update own recipes" ON recipes;
DROP POLICY IF EXISTS "Users delete own recipes" ON recipes;

CREATE POLICY "Users read own recipes"
  ON recipes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own recipes"
  ON recipes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own recipes"
  ON recipes FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own recipes"
  ON recipes FOR DELETE TO authenticated
  USING (user_id = auth.uid());

-- Assign any orphan recipes to your admin user, then enforce NOT NULL:
-- UPDATE recipes SET user_id = 'YOUR-ADMIN-UUID' WHERE user_id IS NULL;

-- Fresh inventory — split policies (if "manage own" ALL policy fails)
DROP POLICY IF EXISTS "Users manage own fresh_inventory" ON fresh_inventory_items;

CREATE POLICY "Users read own fresh_inventory"
  ON fresh_inventory_items FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Users insert own fresh_inventory"
  ON fresh_inventory_items FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users update own fresh_inventory"
  ON fresh_inventory_items FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users delete own fresh_inventory"
  ON fresh_inventory_items FOR DELETE TO authenticated
  USING (user_id = auth.uid());
