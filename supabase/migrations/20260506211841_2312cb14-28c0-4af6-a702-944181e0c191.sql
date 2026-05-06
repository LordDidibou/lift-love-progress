CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE public.workout_exercise_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workout_id uuid NOT NULL,
  exercise_id uuid NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workout_id, exercise_id)
);

ALTER TABLE public.workout_exercise_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own workout notes" ON public.workout_exercise_notes
FOR ALL
USING (EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_exercise_notes.workout_id AND w.user_id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM public.workouts w WHERE w.id = workout_exercise_notes.workout_id AND w.user_id = auth.uid()));

CREATE TRIGGER trg_workout_exercise_notes_updated
BEFORE UPDATE ON public.workout_exercise_notes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();