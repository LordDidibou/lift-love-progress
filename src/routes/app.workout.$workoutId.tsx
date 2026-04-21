import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Calendar } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/workout/$workoutId")({
  component: WorkoutDetailPage,
});

function WorkoutDetailPage() {
  const { workoutId } = Route.useParams();

  const { data, isLoading } = useQuery({
    queryKey: ["workout", workoutId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("*, workout_sets(*, exercises(name, muscle_group))")
        .eq("id", workoutId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) return <div className="text-sm text-muted-foreground">Chargement…</div>;
  if (!data) return <div>Introuvable</div>;

  const grouped = new Map<string, { name: string; sets: typeof data.workout_sets }>();
  data.workout_sets.forEach((s) => {
    const key = s.exercise_id;
    if (!grouped.has(key)) grouped.set(key, { name: s.exercises?.name ?? "—", sets: [] });
    grouped.get(key)!.sets.push(s);
  });
  const totalVolume = data.workout_sets.reduce((a, s) => a + Number(s.reps) * Number(s.weight), 0);

  return (
    <div className="space-y-6">
      <Link to="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Retour
      </Link>

      <div>
        <h1 className="text-3xl font-bold">{data.name}</h1>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {format(new Date(data.started_at), "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr })}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Exercices</p>
          <p className="mt-1 font-display text-xl font-bold">{grouped.size}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Séries</p>
          <p className="mt-1 font-display text-xl font-bold">{data.workout_sets.length}</p>
        </div>
        <div className="rounded-md border border-border bg-card p-3">
          <p className="text-[10px] font-semibold uppercase text-muted-foreground">Volume</p>
          <p className="mt-1 font-display text-xl font-bold text-gradient">{Math.round(totalVolume)} kg</p>
        </div>
      </div>

      <div className="space-y-3">
        {[...grouped.values()].map((g) => (
          <div key={g.name} className="rounded-lg border border-border bg-card p-4">
            <h3 className="font-bold">{g.name}</h3>
            <div className="mt-3 space-y-1">
              {g.sets.map((s, i) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between rounded-md bg-secondary/50 px-3 py-2 text-sm"
                >
                  <span className="text-muted-foreground">Série {i + 1}</span>
                  <span className="font-semibold">
                    {s.weight} kg × {s.reps}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
