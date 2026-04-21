ALTER TABLE public.workout_sets ALTER COLUMN reps TYPE numeric USING reps::numeric;
ALTER TABLE public.routine_exercises ALTER COLUMN target_reps TYPE numeric USING target_reps::numeric;