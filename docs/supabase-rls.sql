-- Family Meals HQ: RLS policies for prototype (no auth)
-- Run in Supabase Dashboard → SQL → New query
--
-- Symptom if missing: "new row violates row-level security policy"
-- on ingredients, recipe_ingredients, or recipes.

-- Recipes
CREATE POLICY "Public read recipes"
  ON recipes FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public insert recipes"
  ON recipes FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Public update recipes"
  ON recipes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Public delete recipes" ON public.recipes;

CREATE POLICY "Public delete recipes"
  ON public.recipes FOR DELETE TO anon, authenticated USING (true);

-- Ingredients
CREATE POLICY "Public read ingredients"
  ON ingredients FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public insert ingredients"
  ON ingredients FOR INSERT TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Public update ingredients" ON public.ingredients;

CREATE POLICY "Public update ingredients"
  ON public.ingredients
  FOR UPDATE
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);

-- Recipe ↔ ingredient links
CREATE POLICY "Public read recipe_ingredients"
  ON recipe_ingredients FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public insert recipe_ingredients"
  ON recipe_ingredients FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Public delete recipe_ingredients"
  ON recipe_ingredients FOR DELETE TO anon, authenticated USING (true);
