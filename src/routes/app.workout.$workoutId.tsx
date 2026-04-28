import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, Calendar, Pencil, Check, X } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/workout/$workoutId")({
  component: WorkoutDetailPage,
});

function WorkoutDetailPage() {
  const { workoutId } = Route.useParams();
  const qc = useQueryClient();

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

  type Set = (typeof data.workout_sets)[number];
  const grouped = new Map<string, { displayName: string; baseName: string; sets: Set[] }>();
  data.workout_sets.forEach((s) => {
    const key = s.exercise_id;
    if (!grouped.has(key)) {
      const baseName = s.exercises?.name ?? "—";
      grouped.set(key, {
        baseName,
        displayName: s.exercise_name_override ?? baseName,
        sets: [],
      });
    }
    grouped.get(key)!.sets.push(s);
  });
  const totalVolume = data.workout_sets.reduce((a, s) => a + Number(s.reps) * Number(s.weight), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Link to="/app" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
        <Link
          to="/app/workout/new"
          search={{ workoutId }}
          className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-semibold hover:border-primary"
        >
          <Pencil className="h-3.5 w-3.5" /> Modifier
        </Link>
      </div>

      <div>
        <h1 className="text-3xl font-bold">{data.name}</h1>
        <p className="mt-1 flex items-center gap-1 text-sm text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          {format(new Date(data.started_at), "dd/MM/yyyy", { locale: fr })}
          <span className="text-xs opacity-70">
            · {format(new Date(data.started_at), "EEEE", { locale: fr })}
          </span>
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
        {[...grouped.entries()].map(([exerciseId, g]) => (
          <ExerciseBlock
            key={exerciseId}
            workoutId={workoutId}
            exerciseId={exerciseId}
            displayName={g.displayName}
            baseName={g.baseName}
            sets={g.sets}
            onUpdated={() => qc.invalidateQueries({ queryKey: ["workout", workoutId] })}
          />
        ))}
      </div>
    </div>
  );
}

function ExerciseBlock({
  workoutId,
  exerciseId,
  displayName,
  baseName,
  sets,
  onUpdated,
}: {
  workoutId: string;
  exerciseId: string;
  displayName: string;
  baseName: string;
  sets: Array<{ id: string; weight: number | string; reps: number | string }>;
  onUpdated: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(displayName);

  const mut = useMutation({
    mutationFn: async (newName: string) => {
      const trimmed = newName.trim();
      // Si l'utilisateur revient au nom de base, on efface l'override (null)
      const override = !trimmed || trimmed === baseName ? null : trimmed;
      const { error } = await supabase
        .from("workout_sets")
        .update({ exercise_name_override: override })
        .eq("workout_id", workoutId)
        .eq("exercise_id", exerciseId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nom mis à jour");
      setEditing(false);
      onUpdated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-2">
        {editing ? (
          <>
            <input
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") mut.mutate(draft);
                if (e.key === "Escape") {
                  setDraft(displayName);
                  setEditing(false);
                }
              }}
              className="min-w-0 flex-1 rounded-md border border-input bg-background px-2 py-1.5 text-sm font-bold focus:border-primary focus:outline-none"
            />
            <button
              onClick={() => mut.mutate(draft)}
              disabled={mut.isPending}
              className="rounded-md bg-primary p-1.5 text-primary-foreground disabled:opacity-50"
              aria-label="Valider"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={() => {
                setDraft(displayName);
                setEditing(false);
              }}
              className="rounded-md border border-border p-1.5 text-muted-foreground"
              aria-label="Annuler"
            >
              <X className="h-4 w-4" />
            </button>
          </>
        ) : (
          <>
            <h3 className="min-w-0 flex-1 truncate font-bold">{displayName}</h3>
            <button
              onClick={() => {
                setDraft(displayName);
                setEditing(true);
              }}
              className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Renommer pour cette séance"
              title="Renommer (uniquement pour cette séance)"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          </>
        )}
      </div>
      <div className="mt-3 space-y-1">
        {sets.map((s, i) => (
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
  );
}
