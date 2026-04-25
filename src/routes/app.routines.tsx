import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Play, X, Search, MoreVertical, Pencil, Edit3 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/routines")({
  component: RoutinesPage,
});

type RoutineExercise = {
  id: string;
  exercise_id: string;
  target_sets: number;
  target_reps: number;
  exercises?: { name: string } | null;
};

type Routine = {
  id: string;
  name: string;
  routine_exercises: RoutineExercise[];
};

function RoutinesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [building, setBuilding] = useState(false);
  const [editing, setEditing] = useState<Routine | null>(null);
  const [renaming, setRenaming] = useState<Routine | null>(null);

  const { data: routines = [] } = useQuery({
    queryKey: ["routines", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routines")
        .select("*, routine_exercises(id, exercise_id, target_sets, target_reps, exercises(name))")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as Routine[];
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
            <RoutineCard
              key={r.id}
              routine={r}
              onRename={() => setRenaming(r)}
              onEdit={() => setEditing(r)}
              onDelete={() => {
                if (confirm(`Supprimer "${r.name}" ?`)) deleteMut.mutate(r.id);
              }}
            />
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

      {editing && (
        <RoutineBuilder
          routine={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["routines"] });
            setEditing(null);
          }}
        />
      )}

      {renaming && (
        <RenameDialog
          routine={renaming}
          onClose={() => setRenaming(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["routines"] });
            setRenaming(null);
          }}
        />
      )}
    </div>
  );
}

function RoutineCard({
  routine,
  onRename,
  onEdit,
  onDelete,
}: {
  routine: Routine;
  onRename: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  return (
    <div className="rounded-lg border border-border bg-card p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-lg font-bold">{routine.name}</h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {routine.routine_exercises.length} exercice(s)
          </p>
        </div>
        <div ref={menuRef} className="relative">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {open && (
            <div className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded-md border border-border bg-card shadow-lg">
              <button
                onClick={() => {
                  setOpen(false);
                  onRename();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <Pencil className="h-3.5 w-3.5" /> Renommer
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <Edit3 className="h-3.5 w-3.5" /> Modifier
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
      <ul className="mt-3 space-y-1 text-sm">
        {routine.routine_exercises.slice(0, 4).map((re) => (
          <li key={re.id} className="flex justify-between text-muted-foreground">
            <span className="truncate">{re.exercises?.name}</span>
            <span className="shrink-0 text-xs">
              {re.target_sets} × {re.target_reps}
            </span>
          </li>
        ))}
        {routine.routine_exercises.length > 4 && (
          <li className="text-xs text-muted-foreground">
            +{routine.routine_exercises.length - 4} autres…
          </li>
        )}
      </ul>
      <Link
        to="/app/workout/new"
        search={{ routineId: routine.id }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-gradient-primary py-2 text-sm font-bold text-primary-foreground shadow-glow"
      >
        <Play className="h-3.5 w-3.5" /> Lancer la séance
      </Link>
    </div>
  );
}

function RenameDialog({
  routine,
  onClose,
  onSaved,
}: {
  routine: Routine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(routine.name);
  const mut = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("routines").update({ name: name.trim() }).eq("id", routine.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Programme renommé");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Renommer</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        />
        <button
          onClick={() => mut.mutate()}
          disabled={!name.trim() || name.trim() === routine.name || mut.isPending}
          className="mt-4 w-full rounded-md bg-gradient-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {mut.isPending ? "..." : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

type Picked = { exercise_id: string; name: string; target_sets: number; target_reps: number };

function RoutineBuilder({
  routine,
  onClose,
  onSaved,
}: {
  routine?: Routine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const isEdit = !!routine;
  const [name, setName] = useState(routine?.name ?? "");
  const [picked, setPicked] = useState<Picked[]>(
    routine
      ? routine.routine_exercises.map((re) => ({
          exercise_id: re.exercise_id,
          name: re.exercises?.name ?? "",
          target_sets: re.target_sets,
          target_reps: Number(re.target_reps),
        }))
      : [],
  );
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

      let routineId: string;
      if (isEdit && routine) {
        const { error } = await supabase
          .from("routines")
          .update({ name: name.trim() })
          .eq("id", routine.id);
        if (error) throw error;
        routineId = routine.id;
        // Remplacer les exercices
        const { error: delErr } = await supabase
          .from("routine_exercises")
          .delete()
          .eq("routine_id", routineId);
        if (delErr) throw delErr;
      } else {
        const { data: r, error } = await supabase
          .from("routines")
          .insert({ user_id: user.id, name: name.trim() })
          .select()
          .single();
        if (error) throw error;
        routineId = r.id;
      }

      const rows = picked.map((p, i) => ({
        routine_id: routineId,
        exercise_id: p.exercise_id,
        position: i,
        target_sets: p.target_sets,
        target_reps: p.target_reps,
      }));
      if (rows.length > 0) {
        const { error: e2 } = await supabase.from("routine_exercises").insert(rows);
        if (e2) throw e2;
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Programme mis à jour" : "Programme créé");
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
          <h2 className="text-lg font-bold">{isEdit ? "Modifier le programme" : "Nouveau programme"}</h2>
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
              <div className="grid grid-cols-[1fr_60px_60px_28px] gap-2 px-2 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                <span>Exercice</span>
                <span className="text-center">Séries</span>
                <span className="text-center">Reps</span>
                <span></span>
              </div>
              {picked.map((p, i) => (
                <div key={p.exercise_id} className="grid grid-cols-[1fr_60px_60px_28px] items-center gap-2 rounded-md border border-border bg-background p-2">
                  <span className="truncate text-sm font-semibold">{p.name}</span>
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={p.target_sets}
                    onChange={(e) =>
                      setPicked((s) =>
                        s.map((x, j) => (j === i ? { ...x, target_sets: Number(e.target.value) } : x)),
                      )
                    }
                    className="w-full rounded border border-input bg-card px-1 py-1 text-center text-sm"
                    aria-label="Nombre de séries"
                  />
                  <input
                    type="number"
                    min={1}
                    inputMode="numeric"
                    value={p.target_reps}
                    onChange={(e) =>
                      setPicked((s) =>
                        s.map((x, j) => (j === i ? { ...x, target_reps: Number(e.target.value) } : x)),
                      )
                    }
                    className="w-full rounded border border-input bg-card px-1 py-1 text-center text-sm"
                    aria-label="Répétitions cibles"
                  />
                  <button
                    onClick={() => setPicked((s) => s.filter((_, j) => j !== i))}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="Retirer"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              ))}
              <p className="px-2 text-[10px] text-muted-foreground">
                💡 Le poids (kg) sera saisi pendant la séance.
              </p>
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
            {saveMut.isPending ? "..." : isEdit ? "Enregistrer les modifications" : "Sauvegarder le programme"}
          </button>
        </div>
      </div>
    </div>
  );
}
