-- Remove redundant pantry_type column; category ('pantry' | 'fresh' | 'meat') is sufficient.
ALTER TABLE public.ingredients DROP COLUMN IF EXISTS pantry_type;
