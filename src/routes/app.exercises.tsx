import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Search, Plus, X, Dumbbell, MoreVertical, Pencil, Trash2, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

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

const EQUIPMENT_TYPES = ["Libre", "Machine", "Poulie", "Poids du corps", "Autre"] as const;
type EquipmentType = (typeof EQUIPMENT_TYPES)[number];

const MACHINE_DETAILS = [
  "Machine guidée (Smith)",
  "Presse à cuisses",
  "Hack squat",
  "Leg curl",
  "Leg extension",
  "Pec deck",
  "Tirage assis",
  "Tirage vertical (lat pulldown)",
  "Rowing machine",
  "Développé machine",
  "Épaules machine",
  "Mollets machine",
  "Autre",
];

const PULLEY_HANDLES = [
  "Barre droite",
  "Barre EZ",
  "Corde",
  "Poignée simple",
  "Poignée V",
  "Étrier large",
  "Sangle cheville",
  "Autre",
];

const INCLINE_OPTIONS = ["Plat", "Incliné", "Décliné", "Autre"] as const;

type Exercise = {
  id: string;
  name: string;
  muscle_group: string;
  equipment: string;
  equipment_detail: string | null;
  incline: string | null;
  instructions: string | null;
  is_custom: boolean;
  image_url: string | null;
  user_id: string | null;
};

function ExercisesPage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState("Tous");
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Exercise | null>(null);

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("*").order("name");
      if (error) throw error;
      return data as Exercise[];
    },
  });

  const { data: hiddenIds = [] } = useQuery({
    queryKey: ["hidden-exercises", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("hidden_exercises").select("exercise_id");
      if (error) throw error;
      return data.map((h) => h.exercise_id as string);
    },
  });

  const visible = useMemo(
    () => exercises.filter((e) => !hiddenIds.includes(e.id)),
    [exercises, hiddenIds],
  );

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return visible.filter((e) => {
      if (group !== "Tous" && e.muscle_group !== group) return false;
      if (q && !e.name.toLowerCase().includes(q) && !e.equipment.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [visible, search, group]);

  // Auto-génération images manquantes
  const triggered = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (typeof navigator !== "undefined" && !navigator.onLine) return;
    const missing = visible.filter((e) => !e.image_url && !triggered.current.has(e.id));
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
  }, [visible, qc]);

  const hideMut = useMutation({
    mutationFn: async (exerciseId: string) => {
      if (!user) throw new Error("Non connecté");
      const { error } = await supabase
        .from("hidden_exercises")
        .insert({ user_id: user.id, exercise_id: exerciseId });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exercice masqué");
      qc.invalidateQueries({ queryKey: ["hidden-exercises"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const deleteMut = useMutation({
    mutationFn: async (exerciseId: string) => {
      const { error } = await supabase.from("exercises").delete().eq("id", exerciseId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Exercice supprimé");
      qc.invalidateQueries({ queryKey: ["exercises"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const handleDelete = (ex: Exercise) => {
    if (!confirm(`Supprimer "${ex.name}" ?`)) return;
    if (ex.is_custom && ex.user_id === user?.id) {
      deleteMut.mutate(ex.id);
    } else {
      hideMut.mutate(ex.id);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-3xl font-bold">Exercices</h1>
          <p className="mt-1 text-sm text-muted-foreground">{visible.length} disponibles</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex shrink-0 items-center gap-2 rounded-lg bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> <span className="hidden sm:inline">Créer</span>
        </button>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            placeholder="Rechercher un exercice…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-input bg-card py-3 pl-10 pr-3 focus:border-primary focus:outline-none"
          />
        </div>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {MUSCLE_GROUPS.map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
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
          <ExerciseCard
            key={ex.id}
            ex={ex}
            currentUserId={user?.id}
            onEdit={() => setEditing(ex)}
            onDelete={() => handleDelete(ex)}
          />
        ))}
        {filtered.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            Aucun exercice ne correspond.
          </div>
        )}
      </div>

      {showAdd && (
        <ExerciseModal
          onClose={() => setShowAdd(false)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["exercises"] });
            setShowAdd(false);
          }}
        />
      )}

      {editing && (
        <ExerciseModal
          exercise={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ["exercises"] });
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function ExerciseCard({
  ex,
  currentUserId,
  onEdit,
  onDelete,
}: {
  ex: Exercise;
  currentUserId?: string;
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

  const isOwn = ex.is_custom && ex.user_id === currentUserId;

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
      <Link
        to="/app/exercise/$exerciseId"
        params={{ exerciseId: ex.id }}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
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
      </Link>
      <div className="flex shrink-0 items-center gap-1">
        {isOwn && (
          <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-accent">
            Custom
          </span>
        )}
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
                  onEdit();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <Pencil className="h-3.5 w-3.5" /> Modifier
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  onDelete();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                {isOwn ? <Trash2 className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                {isOwn ? "Supprimer" : "Masquer"}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function detectEquipmentType(equipment: string): EquipmentType {
  const lower = equipment.toLowerCase();
  if (lower.includes("machine")) return "Machine";
  if (lower.includes("poulie") || lower.includes("câble")) return "Poulie";
  if (lower.includes("poids du corps")) return "Poids du corps";
  if (
    lower.includes("barre") ||
    lower.includes("haltère") ||
    lower.includes("kettlebell") ||
    lower.includes("bande")
  )
    return "Libre";
  return "Autre";
}

function ExerciseModal({
  exercise,
  onClose,
  onSaved,
}: {
  exercise?: Exercise;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const isEdit = !!exercise;
  const isOwn = isEdit && exercise.is_custom && exercise.user_id === user?.id;

  const [name, setName] = useState(exercise?.name ?? "");
  const [muscleGroup, setMuscleGroup] = useState(exercise?.muscle_group ?? "Pectoraux");
  const [equipmentType, setEquipmentType] = useState<EquipmentType>(
    isEdit ? detectEquipmentType(exercise!.equipment) : "Libre",
  );
  const [equipmentFreeText, setEquipmentFreeText] = useState(
    isEdit ? exercise!.equipment : "Barre",
  );
  const [equipmentDetail, setEquipmentDetail] = useState(exercise?.equipment_detail ?? "");
  const [equipmentDetailOther, setEquipmentDetailOther] = useState("");
  const [incline, setIncline] = useState<string>(exercise?.incline ?? "Plat");
  const [instructions, setInstructions] = useState(exercise?.instructions ?? "");

  const finalEquipment = useMemo(() => {
    if (equipmentType === "Libre") return equipmentFreeText.trim() || "Libre";
    if (equipmentType === "Autre") return equipmentFreeText.trim() || "Autre";
    return equipmentType;
  }, [equipmentType, equipmentFreeText]);

  const finalEquipmentDetail = useMemo(() => {
    if (equipmentType !== "Machine" && equipmentType !== "Poulie") return null;
    if (equipmentDetail === "Autre") return equipmentDetailOther.trim() || null;
    return equipmentDetail || null;
  }, [equipmentType, equipmentDetail, equipmentDetailOther]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non connecté");
      const payload = {
        name: name.trim(),
        muscle_group: muscleGroup,
        equipment: finalEquipment,
        equipment_detail: finalEquipmentDetail,
        incline: equipmentType === "Libre" || equipmentType === "Machine" ? incline : null,
        instructions: instructions.trim() || null,
      };

      if (isEdit && isOwn) {
        // Modif directe
        const { error } = await supabase.from("exercises").update(payload).eq("id", exercise!.id);
        if (error) throw error;
        return;
      }

      // Création OU édition d'un built-in : on crée une copie perso et on masque l'original
      const { error } = await supabase.from("exercises").insert({
        ...payload,
        user_id: user.id,
        is_custom: true,
      });
      if (error) throw error;

      if (isEdit && exercise && !isOwn) {
        await supabase
          .from("hidden_exercises")
          .insert({ user_id: user.id, exercise_id: exercise.id });
      }
    },
    onSuccess: () => {
      toast.success(isEdit ? "Exercice modifié" : "Exercice ajouté");
      onSaved();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur md:items-center md:p-4"
      onClick={onClose}
    >
      <div
        className="flex h-[100dvh] w-full max-w-md flex-col border border-border bg-card shadow-card md:h-auto md:max-h-[90vh] md:rounded-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-border p-5">
          <h2 className="text-lg font-bold">{isEdit ? "Modifier l'exercice" : "Nouvel exercice"}</h2>
          <button onClick={onClose} className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
          {isEdit && !isOwn && (
            <p className="rounded-md border border-accent/30 bg-accent/10 p-2 text-xs text-accent-foreground">
              ℹ️ Cet exercice est intégré. Tes modifications créeront une copie perso et masqueront l'original.
            </p>
          )}

          <Field label="Nom">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 focus:border-primary focus:outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Groupe">
              <select
                value={muscleGroup}
                onChange={(e) => setMuscleGroup(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5"
              >
                {MUSCLE_GROUPS.filter((g) => g !== "Tous").map((g) => (
                  <option key={g}>{g}</option>
                ))}
              </select>
            </Field>
            <Field label="Type">
              <select
                value={equipmentType}
                onChange={(e) => setEquipmentType(e.target.value as EquipmentType)}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5"
              >
                {EQUIPMENT_TYPES.map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
          </div>

          {(equipmentType === "Libre" || equipmentType === "Autre") && (
            <Field label={equipmentType === "Libre" ? "Équipement (barre, haltères…)" : "Préciser"}>
              <input
                value={equipmentFreeText}
                onChange={(e) => setEquipmentFreeText(e.target.value)}
                placeholder={equipmentType === "Libre" ? "Barre, Haltères, Kettlebell…" : "À préciser"}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 focus:border-primary focus:outline-none"
              />
            </Field>
          )}

          {equipmentType === "Machine" && (
            <>
              <Field label="Type de machine">
                <select
                  value={equipmentDetail || MACHINE_DETAILS[0]}
                  onChange={(e) => setEquipmentDetail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5"
                >
                  {MACHINE_DETAILS.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              {equipmentDetail === "Autre" && (
                <Field label="Préciser la machine">
                  <input
                    value={equipmentDetailOther}
                    onChange={(e) => setEquipmentDetailOther(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 focus:border-primary focus:outline-none"
                  />
                </Field>
              )}
            </>
          )}

          {equipmentType === "Poulie" && (
            <>
              <Field label="Poignée / accessoire">
                <select
                  value={equipmentDetail || PULLEY_HANDLES[0]}
                  onChange={(e) => setEquipmentDetail(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5"
                >
                  {PULLEY_HANDLES.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              {equipmentDetail === "Autre" && (
                <Field label="Préciser la poignée">
                  <input
                    value={equipmentDetailOther}
                    onChange={(e) => setEquipmentDetailOther(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 focus:border-primary focus:outline-none"
                  />
                </Field>
              )}
            </>
          )}

          {(equipmentType === "Libre" || equipmentType === "Machine") && (
            <Field label="Inclinaison du banc">
              <div className="flex flex-wrap gap-2">
                {INCLINE_OPTIONS.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => setIncline(opt)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                      incline === opt
                        ? "bg-primary text-primary-foreground"
                        : "border border-border bg-background text-muted-foreground"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            </Field>
          )}

          <Field label="Description (optionnel)">
            <textarea
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              rows={3}
              placeholder="Comment exécuter le mouvement…"
              className="w-full resize-none rounded-md border border-input bg-background px-3 py-2.5 focus:border-primary focus:outline-none"
            />
          </Field>
        </div>

        <div className="shrink-0 border-t border-border p-5">
          <button
            onClick={() => saveMut.mutate()}
            disabled={!name.trim() || saveMut.isPending}
            className="w-full rounded-md bg-gradient-primary py-3 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {saveMut.isPending ? "..." : isEdit ? "Enregistrer" : "Ajouter"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  );
}
