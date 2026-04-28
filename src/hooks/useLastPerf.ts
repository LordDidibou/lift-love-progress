import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LastPerfEntry = { weight: number; reps: number };

export type LastPerfResult = {
  /** Première série de la séance la plus récente, par exercice. */
  byExercise: Record<string, LastPerfEntry>;
  /** Toutes les séries de la séance la plus récente, par exercice + set_number. */
  bySet: Record<string, Record<number, LastPerfEntry>>;
};

/**
 * Récupère la dernière performance enregistrée pour chaque exercice donné.
 * - `byExercise[exId]` : 1re série de la séance la plus récente.
 * - `bySet[exId][setNumber]` : série n° N de la séance la plus récente.
 */
export function useLastPerf(exerciseIds: string[]) {
  const key = [...exerciseIds].sort().join(",");
  return useQuery<LastPerfResult>({
    queryKey: ["last-perf", key],
    enabled: exerciseIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sets")
        .select("exercise_id, reps, weight, set_number, workout_id, workouts!inner(started_at)")
        .in("exercise_id", exerciseIds)
        .order("started_at", { ascending: false, foreignTable: "workouts" })
        .limit(2000);
      if (error) throw error;

      // Pour chaque exercice, retient le workout_id le plus récent.
      const latestWorkoutByEx = new Map<string, string>();
      for (const s of data ?? []) {
        if (!latestWorkoutByEx.has(s.exercise_id)) {
          latestWorkoutByEx.set(s.exercise_id, s.workout_id);
        }
      }

      const bySet: Record<string, Record<number, LastPerfEntry>> = {};
      const byExercise: Record<string, LastPerfEntry> = {};
      for (const s of data ?? []) {
        const wantW = latestWorkoutByEx.get(s.exercise_id);
        if (s.workout_id !== wantW) continue;
        const entry = { weight: Number(s.weight), reps: Number(s.reps) };
        if (!bySet[s.exercise_id]) bySet[s.exercise_id] = {};
        bySet[s.exercise_id][s.set_number] = entry;
        // 1re série => byExercise
        if (s.set_number === 1 || !byExercise[s.exercise_id]) {
          byExercise[s.exercise_id] = entry;
        }
      }
      // S'assurer que byExercise = série 1 si dispo
      for (const exId of Object.keys(bySet)) {
        const sets = bySet[exId];
        const minN = Math.min(...Object.keys(sets).map(Number));
        byExercise[exId] = sets[minN];
      }

      return { byExercise, bySet };
    },
  });
}
