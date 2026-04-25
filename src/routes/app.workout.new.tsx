import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Plus, X, Search, Check, Trash2, Flame, Calendar } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DecimalInput } from "@/components/DecimalInput";

const searchSchema = z.object({
  routineId: z.string().optional(),
});

export const Route = createFileRoute("/app/workout/new")({
  validateSearch: searchSchema,
  component: NewWorkoutPage,
});

type LocalSet = { id: string; reps: number; weight: number; done: boolean };
type LocalEx = { exercise_id: string; name: string; sets: LocalSet[] };

function uid() {
  return Math.random().toString(36).slice(2);
}

function NewWorkoutPage() {
  const { routineId } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [name, setName] = useState("");
  const [nameTouched, setNameTouched] = useState(false);
  const [items, setItems] = useState<LocalEx[]>([]);
  const [picker, setPicker] = useState(false);
  const [startedAt, setStartedAt] = useState<Date>(() => new Date());

  // Auto-nom : "Premier exo - dd/MM/yyyy" si l'utilisateur n'a pas saisi de nom
  useEffect(() => {
    if (nameTouched) return;
    const first = items[0]?.name;
    if (first) {
      setName(`${first} – ${format(startedAt, "dd/MM/yyyy")}`);
    } else {
      setName("");
    }
  }, [items, startedAt, nameTouched]);

  // Preload from routine
  const { data: routine } = useQuery({
    queryKey: ["routine", routineId],
    enabled: !!routineId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routines")
        .select("name, routine_exercises(exercise_id, target_sets, target_reps, position, exercises(name))")
        .eq("id", routineId!)
        .single();
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (routine && items.length === 0) {
      setName(routine.name);
      setNameTouched(true); // nom du programme = nom voulu, on désactive l'auto
      const sorted = [...routine.routine_exercises].sort((a, b) => a.position - b.position);
      setItems(
        sorted.map((re) => ({
          exercise_id: re.exercise_id,
          name: re.exercises?.name ?? "—",
          sets: Array.from({ length: re.target_sets }, () => ({
            id: uid(),
            reps: re.target_reps,
            weight: 0,
            done: false,
          })),
        })),
      );
    }
  }, [routine, items.length]);

  const totalDoneSets = useMemo(
    () => items.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0),
    [items],
  );
  const totalVolume = useMemo(
    () =>
      items.reduce(
        (a, e) => a + e.sets.filter((s) => s.done).reduce((b, s) => b + s.reps * s.weight, 0),
        0,
      ),
    [items],
  );

  const finishMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non connecté");
      const { data: w, error } = await supabase
        .from("workouts")
        .insert({
          user_id: user.id,
          routine_id: routineId ?? null,
          name: name.trim() || `Séance – ${format(startedAt, "dd/MM/yyyy")}`,
          started_at: startedAt.toISOString(),
          ended_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;

      const rows: {
        workout_id: string;
        exercise_id: string;
        set_number: number;
        reps: number;
        weight: number;
      }[] = [];
      items.forEach((ex) => {
        ex.sets
          .filter((s) => s.done)
          .forEach((s, idx) => {
            rows.push({
              workout_id: w.id,
              exercise_id: ex.exercise_id,
              set_number: idx + 1,
              reps: s.reps,
              weight: s.weight,
            });
          });
      });
      if (rows.length > 0) {
        const { error: e2 } = await supabase.from("workout_sets").insert(rows);
        if (e2) throw e2;
      }
      return w;
    },
    onSuccess: () => {
      toast.success("Séance enregistrée 💪");
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      navigate({ to: "/app" });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const dateInputValue = format(startedAt, "yyyy-MM-dd");

  return (
    <div className="space-y-5 pb-28">
      <div className="space-y-2">
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setNameTouched(true);
          }}
          placeholder="Nom de la séance"
          className="w-full min-w-0 bg-transparent text-2xl font-bold focus:outline-none"
        />
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <Calendar className="h-3.5 w-3.5" />
          <span>Date :</span>
          <input
            type="date"
            value={dateInputValue}
            max={format(new Date(), "yyyy-MM-dd")}
            onChange={(e) => {
              const [y, m, d] = e.target.value.split("-").map(Number);
              if (!y) return;
              const next = new Date(startedAt);
              next.setFullYear(y, m - 1, d);
              setStartedAt(next);
            }}
            className="rounded border border-input bg-background px-2 py-1 text-xs"
          />
        </label>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <Stat label="Séries" value={`${totalDoneSets}`} />
        <Stat label="Volume" value={`${Math.round(totalVolume)} kg`} />
        <Stat label="Exos" value={`${items.length}`} accent />
      </div>

      <div className="space-y-3">
        {items.map((ex, exIdx) => (
          <div key={ex.exercise_id + exIdx} className="rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold">{ex.name}</h3>
              <button
                onClick={() => setItems((s) => s.filter((_, i) => i !== exIdx))}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 grid grid-cols-[40px_1fr_1fr_40px] items-center gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              <span>Set</span>
              <span>Kg</span>
              <span>Reps</span>
              <span></span>
            </div>
            <div className="mt-1 space-y-1.5">
              {ex.sets.map((set, sIdx) => (
                <div
                  key={set.id}
                  className={`grid grid-cols-[40px_1fr_1fr_40px] items-center gap-2 rounded-md p-1.5 ${
                    set.done ? "bg-primary/10" : ""
                  }`}
                >
                  <span className="text-center text-sm font-bold text-muted-foreground">{sIdx + 1}</span>
                  <DecimalInput
                    value={set.weight}
                    onValueChange={(v) =>
                      setItems((s) =>
                        s.map((x, i) =>
                          i === exIdx
                            ? {
                                ...x,
                                sets: x.sets.map((y, j) => (j === sIdx ? { ...y, weight: v } : y)),
                              }
                            : x,
                        ),
                      )
                    }
                    className="rounded-md border border-input bg-background px-2 py-2 text-center text-sm focus:border-primary focus:outline-none"
                  />
                  <DecimalInput
                    value={set.reps}
                    onValueChange={(v) =>
                      setItems((s) =>
                        s.map((x, i) =>
                          i === exIdx
                            ? {
                                ...x,
                                sets: x.sets.map((y, j) =>
                                  j === sIdx ? { ...y, reps: v } : y,
                                ),
                              }
                            : x,
                        ),
                      )
                    }
                    className="rounded-md border border-input bg-background px-2 py-2 text-center text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    onClick={() =>
                      setItems((s) =>
                        s.map((x, i) =>
                          i === exIdx
                            ? {
                                ...x,
                                sets: x.sets.map((y, j) => (j === sIdx ? { ...y, done: !y.done } : y)),
                              }
                            : x,
                        ),
                      )
                    }
                    className={`flex h-9 w-9 items-center justify-center rounded-md transition-colors ${
                      set.done
                        ? "bg-primary text-primary-foreground"
                        : "border border-border text-muted-foreground"
                    }`}
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={() =>
                setItems((s) =>
                  s.map((x, i) =>
                    i === exIdx
                      ? {
                          ...x,
                          sets: [
                            ...x.sets,
                            {
                              id: uid(),
                              reps: x.sets[x.sets.length - 1]?.reps ?? 10,
                              weight: x.sets[x.sets.length - 1]?.weight ?? 0,
                              done: false,
                            },
                          ],
                        }
                      : x,
                  ),
                )
              }
              className="mt-2 flex w-full items-center justify-center gap-1 rounded-md border border-dashed border-border py-2 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-primary"
            >
              <Plus className="h-3.5 w-3.5" /> Ajouter une série
            </button>
          </div>
        ))}

        <button
          onClick={() => setPicker(true)}
          className="flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-card/50 py-4 text-sm font-bold text-muted-foreground hover:border-primary hover:text-primary"
        >
          <Plus className="h-5 w-5" /> Ajouter un exercice
        </button>
      </div>

      {picker && (
        <ExercisePicker
          onClose={() => setPicker(false)}
          onPick={(ex) => {
            setItems((s) => [
              ...s,
              {
                exercise_id: ex.id,
                name: ex.name,
                sets: [{ id: uid(), reps: 10, weight: 0, done: false }],
              },
            ]);
            setPicker(false);
          }}
        />
      )}

      {/* Sticky footer mobile : bouton Terminer toujours visible */}
      <div className="fixed inset-x-0 bottom-[60px] z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-auto md:right-6 md:w-auto md:border-0 md:bg-transparent md:px-0 md:py-6 md:backdrop-blur-0">
        <div className="mx-auto flex max-w-6xl items-center justify-end">
          <button
            onClick={() => {
              if (totalDoneSets === 0) {
                if (!confirm("Aucune série validée. Terminer quand même ?")) return;
              }
              finishMut.mutate();
            }}
            disabled={finishMut.isPending}
            className="flex w-full items-center justify-center gap-2 rounded-md bg-gradient-primary px-4 py-3 text-sm font-bold text-primary-foreground shadow-glow disabled:opacity-50 md:w-auto"
          >
            <Check className="h-4 w-4" /> Terminer la séance
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-md border border-border bg-card p-3">
      <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        {accent && <Flame className="h-3 w-3 text-accent" />}
        {label}
      </p>
      <p className={`mt-1 font-display text-xl font-bold ${accent ? "text-gradient" : ""}`}>{value}</p>
    </div>
  );
}

function ExercisePicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (ex: { id: string; name: string }) => void;
}) {
  const [q, setQ] = useState("");
  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("id, name, muscle_group, equipment")
        .order("name");
      if (error) throw error;
      return data;
    },
  });
  const filtered = exercises.filter((e) =>
    !q ? true : e.name.toLowerCase().includes(q.toLowerCase()),
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/90 backdrop-blur md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] w-full max-w-md flex-col border border-border bg-card md:h-auto md:max-h-[85vh] md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-4">
          <h2 className="text-lg font-bold">Choisir un exercice</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="shrink-0 border-b border-border p-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              autoFocus
              placeholder="Rechercher…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="w-full rounded-md border border-input bg-background py-2.5 pl-10 pr-3 focus:border-primary focus:outline-none"
            />
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2">
          {filtered.map((e) => (
            <button
              key={e.id}
              onClick={() => onPick(e)}
              className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-3 text-left hover:bg-secondary"
            >
              <span className="truncate font-semibold">{e.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{e.muscle_group}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p className="p-6 text-center text-sm text-muted-foreground">Aucun résultat</p>
          )}
        </div>
      </div>
    </div>
  );
}
