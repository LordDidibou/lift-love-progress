import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Dumbbell } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

const searchSchema = z.object({
  group: z.string().optional(),
  q: z.string().optional(),
});

export const Route = createFileRoute("/app/exercise/$exerciseId")({
  validateSearch: searchSchema,
  component: ExerciseDetailPage,
});

function ExerciseDetailPage() {
  const { exerciseId } = Route.useParams();
  const { group, q } = Route.useSearch();

  const { data: exercise } = useQuery({
    queryKey: ["exercise", exerciseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .eq("id", exerciseId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: recentSets = [] } = useQuery({
    queryKey: ["exercise-recent", exerciseId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workout_sets")
        .select("reps, weight, set_number, workout_id, workouts(name, started_at)")
        .eq("exercise_id", exerciseId)
        .order("created_at", { ascending: false })
        .limit(40);
      if (error) throw error;
      return data;
    },
  });

  // Group by workout
  const grouped = new Map<string, { name: string; date: string; sets: { reps: number; weight: number; set_number: number }[] }>();
  recentSets.forEach((s) => {
    const w = s.workouts;
    if (!w) return;
    if (!grouped.has(s.workout_id)) {
      grouped.set(s.workout_id, { name: w.name, date: w.started_at, sets: [] });
    }
    grouped.get(s.workout_id)!.sets.push({ reps: Number(s.reps), weight: Number(s.weight), set_number: s.set_number });
  });

  const lastSessions = Array.from(grouped.entries())
    .sort(([, a], [, b]) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 5);

  const backSearch = { group: group || undefined, q: q || undefined };
  const backLabel = group ? `Retour à ${group}` : "Retour aux exercices";

  if (!exercise) {
    return (
      <div className="space-y-4">
        <Link to="/app/exercises" search={backSearch} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> {backLabel}
        </Link>
        <p className="text-sm text-muted-foreground">Chargement…</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link to="/app/exercises" search={backSearch} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> {backLabel}
      </Link>

      <div className="flex flex-col gap-4 sm:flex-row">
        <div className="flex h-40 w-full shrink-0 items-center justify-center overflow-hidden rounded-xl bg-secondary text-primary sm:h-32 sm:w-32">
          {exercise.image_url ? (
            <img src={exercise.image_url} alt={exercise.name} className="h-full w-full object-cover" />
          ) : (
            <Dumbbell className="h-10 w-10 opacity-50" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-3xl font-bold">{exercise.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {exercise.muscle_group} · {exercise.equipment}
            {exercise.has_bench && exercise.incline ? ` · banc ${exercise.incline.toLowerCase()}` : ""}
          </p>
        </div>
      </div>

      <section className="overflow-hidden rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="mb-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">Description</h2>
        <p className="whitespace-pre-line break-words text-sm leading-relaxed">
          {exercise.instructions?.trim() || "Pas encore de description pour cet exercice."}
        </p>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">Dernières performances</h2>
        {lastSessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">Aucune série enregistrée pour cet exercice.</p>
        ) : (
          <div className="space-y-3">
            {lastSessions.map(([id, s]) => (
              <div key={id} className="rounded-lg border border-border bg-background p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{s.name}</p>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {format(new Date(s.date), "dd/MM/yyyy", { locale: fr })}
                  </span>
                </div>
                <div className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                  {s.sets
                    .sort((a, b) => a.set_number - b.set_number)
                    .map((set, i) => (
                      <span
                        key={i}
                        className="rounded-md bg-secondary px-2 py-1 text-center text-xs"
                      >
                        {set.weight} kg × {set.reps}
                      </span>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
