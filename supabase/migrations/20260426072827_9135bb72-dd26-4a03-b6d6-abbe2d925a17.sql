-- 1. Position pour ordonner les programmes
ALTER TABLE public.routines ADD COLUMN IF NOT EXISTS position integer NOT NULL DEFAULT 0;

-- 2. Reps par série (myo-reps) — JSON array, null = utiliser target_reps uniforme
ALTER TABLE public.routine_exercises ADD COLUMN IF NOT EXISTS reps_per_set jsonb;

-- 3. Banc oui/non sur les exercices (simplification)
ALTER TABLE public.exercises ADD COLUMN IF NOT EXISTS has_bench boolean NOT NULL DEFAULT false;

-- Marquer les exos qui ont une inclinaison existante comme has_bench=true
UPDATE public.exercises SET has_bench = true WHERE incline IS NOT NULL AND incline <> '';
