import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, Dumbbell } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/app/exercises")({
  component: ExercisesPage,
});

const MUSCLE_GROUPS = [
  "Tous",
  "Pectoraux",
  "Dos",
  "Jambes",
  "Épaules",
  "Biceps",
  "Triceps",
  "Abdominaux",
  "Avant-bras",
];

function ExercisesPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("Tous");
  const [showAdd, setShowAdd] = useState(false);

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("exercises")
        .select("*")
        .order("name");
      if (error) throw error;
      return data;
    },
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return exercises.filter((e) => {
      if (group !== "Tous" && e.muscle_group !== group) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.equipment.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [exercises, search, group]);

  // Auto-génération des images manquantes en arrière-plan (1 par 1, doucement)
  const triggered = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const missing = exercises.filter((e) => !e.image_url && !triggered.current.has(e.id));
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      for (const ex of missing.slice(0, 3)) {
        if (cancelled) return;
        triggered.current.add(ex.id);
        try {
          const { data, error } = await supabase.functions.invoke("generate-exercise-image", {
            body: { exerciseId: ex.id },
          });
          if (error || data?.error) continue;
          qc.invalidateQueries({ queryKey: ["exercises"] });
        } catch {
          /* silencieux */
        }
        await new Promise((r) => setTimeout(r, 1200));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [exercises, qc]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Exercices</h1>
          <p className="mt-1 text-sm text-muted-foreground">{exercises.length} disponibles</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Créer</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Rechercher un exercice ou un équipement…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-card py-3 pl-10 pr-3 text-sm focus:border-primary focus:outline-none"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                group === g
                  ? "bg-primary text-primary-foreground"
                  : "border border-border bg-card text-muted-foreground hover:text-foreground"
              }`}
            >
              {g}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-2 md:grid-cols-2">
        {filtered.map((ex) => (
          <ExerciseCard key={ex.id} ex={ex} />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Aucun exercice ne correspond.
          </div>
        )}
      </div>

      {showAdd && (
        <AddExerciseModal
          onClose={() => setShowAdd(false)}
          onAdded={() => {
            qc.invalidateQueries({ queryKey: ["exercises"] });
            setShowAdd(false);
          }}
        />
      )}
    </div>
  );
}

type Exercise = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  is_custom: boolean;
  image_url: string | null;
};

function ExerciseCard({ ex }: { ex: Exercise }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md bg-secondary text-primary">
          {ex.image_url ? (
            <img src={ex.image_url} alt={ex.name} className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Dumbbell className="h-5 w-5 animate-pulse opacity-50" />
          )}
        </div>
        <div className="min-w-0">
          <div className="truncate font-semibold">{ex.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {ex.muscle_group} · {ex.equipment}
          </div>
        </div>
      </div>
      {ex.is_custom && (
        <span className="shrink-0 rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
          Custom
        </span>
      )}
    </div>
  );
}

function AddExerciseModal({ onClose, onAdded }: { onClose: () => void; onAdded: () => void }) {
  const [name, setName] = useState("");
  const [muscleGroup, setMuscleGroup] = useState("Pectoraux");
  const [equipment, setEquipment] = useState("Barre");

  const createMut = useMutation({
    mutationFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Non connecté");
      const { error } = await supabase.from("exercises").insert({
        user_id: user.id,
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment,
        is_custom: true,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exercice ajouté");
      onAdded();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 p-4 backdrop-blur md:items-center"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl border border-border bg-card p-6 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Nouvel exercice</h2>
          <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
              Nom
            </label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Groupe
              </label>
              <select
                value={muscleGroup}
                onChange={(e) => setMuscleGroup(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {MUSCLE_GROUPS.filter((g) => g !== "Tous").map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
                Équipement
              </label>
              <select
                value={equipment}
                onChange={(e) => setEquipment(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {["Barre", "Haltères", "Machine", "Poulie", "Poids du corps", "Kettlebell", "Bandes"].map(
                  (e) => (
                    <option key={e}>{e}</option>
                  ),
                )}
              </select>
            </div>
          </div>
          <button
            onClick={() => createMut.mutate()}
            disabled={!name.trim() || createMut.isPending}
            className="w-full rounded-md bg-gradient-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {createMut.isPending ? "..." : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}
