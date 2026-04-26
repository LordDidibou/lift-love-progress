import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type LastPerfEntry = { weight: number; reps: number };

/**
 * Récupère la dernière performance enregistrée pour chaque exercice donné.
 * Renvoie un objet { [exerciseId]: { weight, reps } } basé sur la 1re série
 * de la séance la plus récente où l'exo apparaît.
 */
export function useLastPerf(exerciseIds: string[]) {
  const key = [...exerciseIds].sort().join(",");
  return useQuery({
    queryKey: ["last-perf", key],
    enabled: exerciseIds.length > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sets")
        .select("exercise_id, reps, weight, set_number, created_at")
        .in("exercise_id", exerciseIds)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const map = new Map<string, LastPerfEntry>();
      for (const s of data ?? []) {
        if (!map.has(s.exercise_id)) {
          map.set(s.exercise_id, { weight: Number(s.weight), reps: Number(s.reps) });
        }
      }
      return Object.fromEntries(map.entries()) as Record<string, LastPerfEntry>;
    },
  });
}
