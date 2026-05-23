-- Ingredient requests: users ask admin to add rows to the master ingredients table.
-- Run in Supabase SQL editor after enabling Auth (optional for prototype RLS below).

CREATE TABLE IF NOT EXISTS ingredient_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_name text NOT NULL,
  category text NOT NULL CHECK (category IN ('pantry', 'fresh', 'meat')),
  recipe_line text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_ingredient_id uuid REFERENCES ingredients (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS ingredient_requests_status_created_idx
  ON ingredient_requests (status, created_at DESC);

ALTER TABLE ingredient_requests ENABLE ROW LEVEL SECURITY;

-- Prototype: open access (replace when per-user auth is added)
CREATE POLICY "Public read ingredient_requests"
  ON ingredient_requests FOR SELECT TO anon, authenticated USING (true);

CREATE POLICY "Public insert ingredient_requests"
  ON ingredient_requests FOR INSERT TO anon, authenticated WITH CHECK (true);

CREATE POLICY "Public update ingredient_requests"
  ON ingredient_requests FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
