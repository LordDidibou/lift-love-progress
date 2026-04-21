import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Plus, Trash2, Play, X, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/routines")({
  component: RoutinesPage,
});

function RoutinesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [building, setBuilding] = useState(false);

  const { data: routines = [] } = useQuery({
    queryKey: ["routines", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routines")
        .select("*, routine_exercises(id, exercise_id, target_sets, target_reps, exercises(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("routines").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Programme supprimé");
      qc.invalidateQueries({ queryKey: ["routines"] });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Programmes</h1>
          <p className="mt-1 text-sm text-muted-foreground">Tes templates de séances</p>
        </div>
        <button
          onClick={() => setBuilding(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Nouveau</span>
        </button>
      </div>

      {routines.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-card/50 p-10 text-center">
          <p className="font-semibold">Aucun programme</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Crée ton premier programme (Push, Pull, Legs, Full Body…)
          </p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {routines.map((r) => (
            <div
              key={r.id}
              className="group rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40"
            >
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-lg font-bold">{r.name}</h3>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {r.routine_exercises.length} exercice(s)
                  </p>
                </div>
                <button
                  onClick={() => {
                    if (confirm("Supprimer ce programme ?")) deleteMut.mutate(r.id);
                  }}
                  className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <ul className="mt-3 space-y-1 text-sm">
                {r.routine_exercises.slice(0, 4).map((re) => (
                  <li key={re.id} className="flex justify-between text-muted-foreground">
                    <span>{re.exercises?.name}</span>
                    <span className="text-xs">
                      {re.target_sets} × {re.target_reps}
                    </span>
                  </li>
                ))}
                {r.routine_exercises.length > 4 && (
                  <li className="text-xs text-muted-foreground">
                    +{r.routine_exercises.length - 4} autres…
                  </li>
                )}
              </ul>
              <Link
                to="/app/workout/new"
                search={{ routineId: r.id }}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-gradient-primary py-2 text-sm font-bold text-primary-foreground shadow-glow"
              >
                <Play className="h-3.5 w-3.5" /> Lancer la séance
              </Link>
            </div>
          ))}
        </div>
      )}

      {building && (
        <RoutineBuilder
          onClose={() => setBuilding(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["routines"] });
            setBuilding(false);
          }}
        />
      )}
    </div>
  );
}

type Picked = { exercise_id: string; name: string; target_sets: number; target_reps: number };

function RoutineBuilder({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState("");
  const [picked, setPicked] = useState<Picked[]>([]);
  const [search, setSearch] = useState("");

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("id, name, muscle_group").order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = exercises.filter(
    (e) =>
      (!search || e.name.toLowerCase().includes(search.toLowerCase())) &&
      !picked.some((p) => p.exercise_id === e.id),
  );

  const saveMut = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");
      const { data: r, error } = await supabase
        .from("routines")
        .insert({ user_id: user.id, name: name.trim() })
        .select()
        .single();
      if (error) throw error;
      const rows = picked.map((p, i) => ({
        routine_id: r.id,
        exercise_id: p.exercise_id,
        position: i,
        target_sets: p.target_sets,
        target_reps: p.target_reps,
      }));
      const { error: e2 } = await supabase.from("routine_exercises").insert(rows);
      if (e2) throw e2;
    },
    onSuccess: () => {
      toast.success("Programme créé");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/90 p-0 backdrop-blur md:items-center md:p-6"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-t-2xl border border-border bg-card shadow-card md:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-bold">Nouveau programme</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 space-y-4 overflow-y-auto p-5">
          <input
            placeholder="Nom (ex: Push Day)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm font-semibold focus:border-primary focus:outline-none"
          />

          {picked.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Exercices ({picked.length})
              </p>
              {picked.map((p, i) => (
                <div key={p.exercise_id} className="flex items-center gap-2 rounded-md border border-border bg-background p-2">
                  <span className="flex-1 text-sm font-semibold">{p.name}</span>
                  <input
                    type="number"
                    min={1}
                    value={p.target_sets}
                    onChange={(e) =>
                      setPicked((s) =>
                        s.map((x, j) => (j === i ? { ...x, target_sets: Number(e.target.value) } : x)),
                      )
                    }
                    className="w-14 rounded border border-input bg-card px-2 py-1 text-center text-sm"
                  />
                  <span className="text-xs text-muted-foreground">×</span>
                  <input
                    type="number"
                    min={1}
                    value={p.target_reps}
                    onChange={(e) =>
                      setPicked((s) =>
                        s.map((x, j) => (j === i ? { ...x, target_reps: Number(e.target.value) } : x)),
                      )
                    }
                    className="w-14 rounded border border-input bg-card px-2 py-1 text-center text-sm"
                  />
                  <button
                    onClick={() => setPicked((s) => s.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ajouter un exercice
            </p>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                placeholder="Chercher…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-3 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="mt-2 max-h-60 space-y-1 overflow-y-auto">
              {filtered.slice(0, 30).map((e) => (
                <button
                  key={e.id}
                  onClick={() =>
                    setPicked((s) => [...s, { exercise_id: e.id, name: e.name, target_sets: 3, target_reps: 10 }])
                  }
                  className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left text-sm hover:bg-secondary"
                >
                  <span>{e.name}</span>
                  <span className="text-xs text-muted-foreground">{e.muscle_group}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <div className="border-t border-border p-5">
          <button
            onClick={() => saveMut.mutate()}
            disabled={!name.trim() || picked.length === 0 || saveMut.isPending}
            className="w-full rounded-md bg-gradient-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            Sauvegarder le programme
          </button>
        </div>
      </div>
    </div>
  );
}
