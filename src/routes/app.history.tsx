import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Calendar,
  Clock,
  Dumbbell,
  TrendingUp,
  Search,
  MoreVertical,
  FileEdit,
  Pencil,
  Trash2,
  ArrowDownAZ,
  ArrowUpAZ,
} from "lucide-react";
import { format, formatDistanceToNow, differenceInMinutes } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCompact } from "@/lib/formatNumber";
import { withDateSuffix, stripTrailingDate } from "@/lib/workoutName";

export const Route = createFileRoute("/app/history")({
  component: HistoryPage,
});

type WorkoutWithSets = {
  id: string;
  name: string;
  routine_id: string | null;
  started_at: string;
  ended_at: string | null;
  workout_sets: { reps: number; weight: number }[];
};

function HistoryPage() {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [sortDesc, setSortDesc] = useState(true);

  const { data: workouts = [], isLoading } = useQuery({
    queryKey: ["workouts", "history", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("id, name, routine_id, started_at, ended_at, workout_sets(reps, weight)")
        .eq("status", "completed")
        .order("started_at", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data as WorkoutWithSets[];
    },
  });

  const enriched = useMemo(() => {
    return workouts.map((w) => {
      const volume = (w.workout_sets ?? []).reduce(
        (acc, s) => acc + Number(s.reps) * Number(s.weight),
        0,
      );
      const duration =
        w.ended_at && w.started_at
          ? Math.max(0, differenceInMinutes(new Date(w.ended_at), new Date(w.started_at)))
          : null;
      return {
        ...w,
        volume,
        sets: w.workout_sets?.length ?? 0,
        duration,
        type: w.routine_id ? "Programme" : "Libre",
      };
    });
  }, [workouts]);

  const filtered = useMemo(() => {
    const s = q.toLowerCase().trim();
    const list = s
      ? enriched.filter((w) => w.name.toLowerCase().includes(s))
      : enriched;
    const sorted = [...list].sort((a, b) => {
      const da = new Date(a.started_at).getTime();
      const db = new Date(b.started_at).getTime();
      return sortDesc ? db - da : da - db;
    });
    return sorted;
  }, [enriched, q, sortDesc]);

  // Group by month for visual scanning
  const groups = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    filtered.forEach((w) => {
      const key = format(new Date(w.started_at), "MMMM yyyy", { locale: fr });
      const arr = map.get(key) ?? [];
      arr.push(w);
      map.set(key, arr);
    });
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="space-y-5 pb-8">
      <div className="flex items-center gap-3">
        <Link
          to="/app"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Retour"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-bold sm:text-3xl">Historique</h1>
          <p className="text-xs text-muted-foreground">
            {workouts.length} séance{workouts.length > 1 ? "s" : ""} au total
          </p>
        </div>
        <button
          onClick={() => setSortDesc((v) => !v)}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground hover:text-foreground"
          aria-label="Inverser le tri"
        >
          {sortDesc ? <ArrowDownAZ className="h-4 w-4" /> : <ArrowUpAZ className="h-4 w-4" />}
        </button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          placeholder="Rechercher une séance…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="w-full rounded-lg border border-input bg-card py-2.5 pl-10 pr-3 text-sm focus:border-primary focus:outline-none"
        />
      </div>

      {isLoading && (
        <p className="py-12 text-center text-sm text-muted-foreground">Chargement…</p>
      )}

      {!isLoading && filtered.length === 0 && (
        <div className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Aucune séance trouvée.
        </div>
      )}

      <div className="space-y-6">
        {groups.map(([month, items]) => (
          <section key={month} className="space-y-2">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {month}
            </h2>
            <div className="space-y-2">
              {items.map((w) => (
                <HistoryRow key={w.id} workout={w} />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

type EnrichedWorkout = {
  id: string;
  name: string;
  routine_id: string | null;
  started_at: string;
  ended_at: string | null;
  volume: number;
  sets: number;
  duration: number | null;
  type: string;
};

function HistoryRow({ workout }: { workout: EnrichedWorkout }) {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const delMut = useMutation({
    mutationFn: async () => {
      await supabase.from("workout_sets").delete().eq("workout_id", workout.id);
      const { error } = await supabase.from("workouts").delete().eq("id", workout.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance supprimée");
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const [confirmDel, setConfirmDel] = useState(false);

  return (
    <>
      <div className="relative flex w-full min-w-0 items-stretch gap-1 rounded-lg border border-border bg-card pl-3 pr-1 py-3 transition-colors hover:border-primary/40">
        <button
          onClick={() =>
            navigate({ to: "/app/workout/$workoutId", params: { workoutId: workout.id } })
          }
          className="flex min-w-0 flex-1 flex-col gap-2 text-left"
        >
          <div className="flex min-w-0 items-center gap-2">
            <span className="truncate font-semibold">{stripTrailingDate(workout.name)}</span>
            <span
              className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider ${
                workout.routine_id
                  ? "bg-accent/10 text-accent"
                  : "bg-primary/10 text-primary"
              }`}
            >
              {workout.type}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {format(new Date(workout.started_at), "dd/MM/yyyy")}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {workout.duration !== null ? `${workout.duration} min` : "—"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Dumbbell className="h-3 w-3" />
              {workout.sets} séries
            </span>
            <span className="inline-flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              {formatCompact(workout.volume)} kg
            </span>
          </div>
          <p className="text-[10px] text-muted-foreground/70">
            {formatDistanceToNow(new Date(workout.started_at), { addSuffix: true, locale: fr })}
          </p>
        </button>
        <div ref={menuRef} className="relative shrink-0 self-start">
          <button
            onClick={() => setOpen((v) => !v)}
            className="flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Options"
          >
            <MoreVertical className="h-5 w-5" />
          </button>
          {open && (
            <div className="absolute right-0 top-full z-30 mt-1 w-52 max-w-[calc(100vw-2rem)] overflow-hidden rounded-md border border-border bg-card shadow-lg">
              <button
                onClick={() => {
                  setOpen(false);
                  navigate({ to: "/app/workout/new", search: { workoutId: workout.id } });
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <FileEdit className="h-3.5 w-3.5" /> Modifier la séance
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setEdit(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
              >
                <Pencil className="h-3.5 w-3.5" /> Renommer / Date
              </button>
              <button
                onClick={() => {
                  setOpen(false);
                  setConfirmDel(true);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
      {edit && <RenameDialog workout={workout} onClose={() => setEdit(false)} />}
      {confirmDel && (
        <ConfirmDialog
          title="Supprimer la séance ?"
          message={`"${stripTrailingDate(workout.name)}" sera définitivement supprimée. Cette action est irréversible.`}
          confirmLabel="Supprimer"
          destructive
          onConfirm={() => {
            setConfirmDel(false);
            delMut.mutate();
          }}
          onCancel={() => setConfirmDel(false)}
        />
      )}
    </>
  );
}

function RenameDialog({
  workout,
  onClose,
}: {
  workout: EnrichedWorkout;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(stripTrailingDate(workout.name));
  const [date, setDate] = useState(format(new Date(workout.started_at), "yyyy-MM-dd"));

  const mut = useMutation({
    mutationFn: async () => {
      const original = new Date(workout.started_at);
      const [y, m, d] = date.split("-").map(Number);
      const next = new Date(original);
      next.setFullYear(y, m - 1, d);
      const finalName = withDateSuffix(name, next);
      const { error } = await supabase
        .from("workouts")
        .update({ name: finalName, started_at: next.toISOString() })
        .eq("id", workout.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance mise à jour");
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-card"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-lg font-bold">Modifier la séance</h2>
        <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
          Nom
        </label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        />
        <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">
          Date
        </label>
        <input
          type="date"
          value={date}
          max={format(new Date(), "yyyy-MM-dd")}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        />
        <div className="flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold"
          >
            Annuler
          </button>
          <button
            onClick={() => mut.mutate()}
            disabled={!name.trim() || mut.isPending}
            className="flex-1 rounded-md bg-gradient-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {mut.isPending ? "..." : "Enregistrer"}
          </button>
        </div>
      </div>
    </div>
  );
}
