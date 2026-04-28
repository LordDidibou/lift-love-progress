-- Fix 2: draft status on workouts
ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed';

-- Fix 3: per-occurrence exercise name override on workout_sets
ALTER TABLE public.workout_sets
  ADD COLUMN IF NOT EXISTS exercise_name_override TEXT;

CREATE INDEX IF NOT EXISTS idx_workouts_user_status ON public.workouts(user_id, status);
