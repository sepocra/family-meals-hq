-- Multi-user: profiles, per-user recipes/inventory/meals, shared ingredients (admin write).
-- Run in Supabase SQL editor. Create your admin user in Authentication first, then run backfill.

-- ---------------------------------------------------------------------------
-- Profiles (admin flag)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  is_admin boolean NOT NULL DEFAULT false,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own profile"
  ON profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users update own profile"
  ON profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND is_admin = true
  );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, is_admin)
  VALUES (NEW.id, false)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Promote your admin (replace UUID from Authentication → Users):
-- UPDATE profiles SET is_admin = true WHERE id = 'YOUR-ADMIN-USER-UUID';

-- ---------------------------------------------------------------------------
-- Recipes: per user
-- ---------------------------------------------------------------------------
ALTER TABLE recipes
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE CASCADE;

-- Assign existing rows to admin before NOT NULL:
-- UPDATE recipes SET user_id = 'YOUR-ADMIN-USER-UUID' WHERE user_id IS NULL;

ALTER TABLE recipes
  ALTER COLUMN user_id SET DEFAULT auth.uid();

-- After backfill:
-- ALTER TABLE recipes ALTER COLUMN user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS recipes_user_id_idx ON recipes (user_id);

DROP POLICY IF EXISTS "Public read recipes" ON recipes;
DROP POLICY IF EXISTS "Public insert recipes" ON recipes;
DROP POLICY IF EXISTS "Public update recipes" ON recipes;
DROP POLICY IF EXISTS "Public delete recipes" ON public.recipes;

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

-- ---------------------------------------------------------------------------
-- recipe_ingredients: via owning recipe
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read recipe_ingredients" ON recipe_ingredients;
DROP POLICY IF EXISTS "Public insert recipe_ingredients" ON recipe_ingredients;
DROP POLICY IF EXISTS "Public delete recipe_ingredients" ON recipe_ingredients;

CREATE POLICY "Users read own recipe_ingredients"
  ON recipe_ingredients FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_ingredients.recipe_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users insert own recipe_ingredients"
  ON recipe_ingredients FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_ingredients.recipe_id AND r.user_id = auth.uid()
    )
  );

CREATE POLICY "Users delete own recipe_ingredients"
  ON recipe_ingredients FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM recipes r
      WHERE r.id = recipe_ingredients.recipe_id AND r.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- ingredients: shared read; admin write only
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public read ingredients" ON ingredients;
DROP POLICY IF EXISTS "Public insert ingredients" ON ingredients;
DROP POLICY IF EXISTS "Public update ingredients" ON public.ingredients;

CREATE POLICY "Authenticated read ingredients"
  ON ingredients FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin insert ingredients"
  ON ingredients FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin());

CREATE POLICY "Admin update ingredients"
  ON ingredients FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

-- ---------------------------------------------------------------------------
-- Fresh inventory (per user)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fresh_inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE DEFAULT auth.uid(),
  name text NOT NULL,
  category text NOT NULL CHECK (category IN ('produce', 'meat')),
  quantity text,
  added_at date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS fresh_inventory_items_user_id_idx
  ON fresh_inventory_items (user_id);

ALTER TABLE fresh_inventory_items ENABLE ROW LEVEL SECURITY;

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

-- ---------------------------------------------------------------------------
-- Weekly meals state (per user; suggestions JSON + selected recipe ids)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_weekly_meals (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  suggestions jsonb NOT NULL DEFAULT '[]'::jsonb,
  selected_recipe_ids uuid[] NOT NULL DEFAULT '{}'::uuid[]
);

ALTER TABLE user_weekly_meals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own weekly_meals"
  ON user_weekly_meals FOR ALL TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Ingredient requests (per user; admin resolves)
-- ---------------------------------------------------------------------------
ALTER TABLE ingredient_requests
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL;

ALTER TABLE ingredient_requests
  ALTER COLUMN user_id SET DEFAULT auth.uid();

DROP POLICY IF EXISTS "Public read ingredient_requests" ON ingredient_requests;
DROP POLICY IF EXISTS "Public insert ingredient_requests" ON ingredient_requests;
DROP POLICY IF EXISTS "Public update ingredient_requests" ON ingredient_requests;

CREATE POLICY "Users read own or admin reads all ingredient_requests"
  ON ingredient_requests FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_app_admin());

CREATE POLICY "Users insert own ingredient_requests"
  ON ingredient_requests FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "Admin update ingredient_requests"
  ON ingredient_requests FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());
