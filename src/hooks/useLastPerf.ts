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
 * Note: PostgREST `order(..., foreignTable)` ne trie PAS les lignes parentes,
 * il faut donc déterminer le workout le plus récent côté client à partir de
 * `workouts.started_at` embarqué dans chaque set.
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
        .select(
          "exercise_id, reps, weight, set_number, workout_id, workouts!inner(started_at, status)",
        )
        .in("exercise_id", exerciseIds)
        .limit(5000);
      if (error) throw error;

      // Pour chaque exercice : trouver le workout_id le plus récent (started_at max),
      // en ignorant les brouillons (status = 'draft').
      const latestByEx = new Map<string, { workoutId: string; startedAt: number }>();
      for (const s of (data ?? []) as Array<{
        exercise_id: string;
        workout_id: string;
        workouts: { started_at: string; status: string | null } | null;
      }>) {
        if (s.workouts?.status === "draft") continue;
        const ts = s.workouts?.started_at ? new Date(s.workouts.started_at).getTime() : 0;
        const cur = latestByEx.get(s.exercise_id);
        if (!cur || ts > cur.startedAt) {
          latestByEx.set(s.exercise_id, { workoutId: s.workout_id, startedAt: ts });
        }
      }

      const bySet: Record<string, Record<number, LastPerfEntry>> = {};
      const byExercise: Record<string, LastPerfEntry> = {};
      for (const s of data ?? []) {
        const want = latestByEx.get(s.exercise_id);
        if (!want || s.workout_id !== want.workoutId) continue;
        const entry = { weight: Number(s.weight), reps: Number(s.reps) };
        if (!bySet[s.exercise_id]) bySet[s.exercise_id] = {};
        bySet[s.exercise_id][s.set_number] = entry;
      }
      // byExercise = série n° min disponible dans la dernière séance
      for (const exId of Object.keys(bySet)) {
        const sets = bySet[exId];
        const minN = Math.min(...Object.keys(sets).map(Number));
        byExercise[exId] = sets[minN];
      }

      return { byExercise, bySet };
    },
  });
}
