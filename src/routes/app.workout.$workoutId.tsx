import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Calendar, Pencil, X, Search, Plus, Check } from "lucide-react";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/workout/$workoutId")({
  component: WorkoutDetailPage,
});

type ExerciseLite = {
  id: string;
  name: string;
  muscle_group: string;
  user_id: string | null;
};

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
            onUpdated={() => {
              qc.invalidateQueries({ queryKey: ["workout", workoutId] });
              qc.invalidateQueries({ queryKey: ["exercises"] });
            }}
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
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 flex-1 truncate font-bold">{displayName}</h3>
        <button
          onClick={() => setPickerOpen(true)}
          className="shrink-0 rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Changer l'exercice pour cette séance"
          title="Changer l'exercice (uniquement pour cette séance)"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
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

      {pickerOpen && (
        <ExercisePickerSheet
          workoutId={workoutId}
          currentExerciseId={exerciseId}
          currentDisplayName={displayName}
          baseName={baseName}
          onClose={() => setPickerOpen(false)}
          onDone={() => {
            setPickerOpen(false);
            onUpdated();
          }}
        />
      )}
    </div>
  );
}

function ExercisePickerSheet({
  workoutId,
  currentExerciseId,
  currentDisplayName,
  baseName,
  onClose,
  onDone,
}: {
  workoutId: string;
  currentExerciseId: string;
  currentDisplayName: string;
  baseName: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id,name,muscle_group,user_id")
        .order("name");
      if (error) throw error;
      return data as ExerciseLite[];
    },
  });

  const { data: hiddenIds = [] } = useQuery({
    queryKey: ["hidden-exercises", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("hidden_exercises").select("exercise_id");
      if (error) throw error;
      return (data ?? []).map((r) => r.exercise_id as string);
    },
  });

  const visible = useMemo(() => {
    const hidden = new Set(hiddenIds);
    return exercises.filter((e) => !hidden.has(e.id));
  }, [exercises, hiddenIds]);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(() => {
    if (!q) return visible;
    return visible.filter((e) => e.name.toLowerCase().includes(q));
  }, [visible, q]);

  const exactMatch = useMemo(
    () => visible.find((e) => e.name.toLowerCase() === q),
    [visible, q],
  );

  const repointMut = useMutation({
    mutationFn: async (newExerciseId: string) => {
      // Re-rattache uniquement les sets de cette séance pour cet exercice
      const { error } = await supabase
        .from("workout_sets")
        .update({ exercise_id: newExerciseId, exercise_name_override: null })
        .eq("workout_id", workoutId)
        .eq("exercise_id", currentExerciseId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exercice mis à jour");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const createMut = useMutation({
    mutationFn: async (name: string) => {
      if (!user) throw new Error("Non connecté");
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Nom vide");
      const { data, error } = await supabase
        .from("exercises")
        .insert({
          name: trimmed,
          muscle_group: "Autre",
          equipment: "Autre",
          has_bench: false,
          is_custom: true,
          user_id: user.id,
        })
        .select("id")
        .single();
      if (error) throw error;
      // Re-rattache les sets vers ce nouvel exercice
      const { error: e2 } = await supabase
        .from("workout_sets")
        .update({ exercise_id: data.id, exercise_name_override: null })
        .eq("workout_id", workoutId)
        .eq("exercise_id", currentExerciseId);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Exercice créé et rattaché");
      onDone();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const busy = repointMut.isPending || createMut.isPending;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur md:items-center md:p-4"
      onClick={() => !busy && onClose()}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl border border-border bg-card md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-4">
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">
              Remplacer
            </p>
            <p className="truncate text-sm font-bold">{currentDisplayName}</p>
            {currentDisplayName !== baseName && (
              <p className="truncate text-[11px] text-muted-foreground">base : {baseName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            disabled={busy}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground disabled:opacity-50"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="border-b border-border p-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher un exercice…"
              className="w-full rounded-md border border-input bg-background py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 ? (
            <p className="p-6 text-center text-sm text-muted-foreground">
              Aucun exercice trouvé
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {filtered.map((ex) => {
                const isCurrent = ex.id === currentExerciseId;
                return (
                  <li key={ex.id}>
                    <button
                      onClick={() => !busy && !isCurrent && repointMut.mutate(ex.id)}
                      disabled={busy || isCurrent}
                      className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-secondary/60 disabled:opacity-60"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{ex.name}</p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {ex.muscle_group}
                          {ex.user_id ? " · perso" : ""}
                        </p>
                      </div>
                      {isCurrent && <Check className="h-4 w-4 text-primary" />}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border p-3">
          <button
            onClick={() => !busy && createMut.mutate(query || "")}
            disabled={busy || !query.trim() || !!exactMatch}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-3 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            title={
              exactMatch
                ? "Un exercice avec ce nom existe déjà"
                : "Créer un nouvel exercice"
            }
          >
            <Plus className="h-4 w-4" />
            {query.trim()
              ? `Créer un nouvel exercice : ${query.trim()}`
              : "Saisis un nom pour créer un nouvel exercice"}
          </button>
        </div>
      </div>
    </div>
  );
}
