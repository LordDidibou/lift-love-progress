import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Plus, Activity, TrendingUp, Calendar, Flame, MoreVertical, Pencil, Trash2, FileEdit } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { withDateSuffix, stripTrailingDate } from "@/lib/workoutName";

export const Route = createFileRoute("/app/")({
  component: HomePage,
});

function HomePage() {
  const { user } = useAuth();

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const firstName =
    profile?.display_name?.split(" ")[0] ?? user?.email?.split("@")[0] ?? "";

  const { data: workouts } = useQuery({
    queryKey: ["workouts", "recent", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("id, name, started_at, ended_at")
        .order("started_at", { ascending: false })
        .limit(8);
      if (error) throw error;
      return data;
    },
  });

  const { data: stats } = useQuery({
    queryKey: ["stats", "summary", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = new Date();
      since.setDate(since.getDate() - 7);
      const [{ count: weekCount }, { count: totalCount }, { data: setsAgg }] = await Promise.all([
        supabase
          .from("workouts")
          .select("*", { count: "exact", head: true })
          .gte("started_at", since.toISOString()),
        supabase.from("workouts").select("*", { count: "exact", head: true }),
        supabase.from("workout_sets").select("reps, weight"),
      ]);
      const totalVolume = (setsAgg ?? []).reduce(
        (acc, s) => acc + Number(s.reps) * Number(s.weight),
        0,
      );
      return { weekCount: weekCount ?? 0, totalCount: totalCount ?? 0, totalVolume };
    },
  });

  return (
    <div className="space-y-8">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {format(new Date(), "EEEE d MMMM", { locale: fr })}
          </p>
          <h1 className="mt-1 text-2xl font-bold sm:text-3xl md:text-4xl">
            {firstName ? `Salut ${firstName} 💪` : "Prêt à forger ?"}
          </h1>
        </div>
        <Link
          to="/app/workout/new"
          className="flex shrink-0 items-center gap-2 rounded-lg bg-gradient-primary px-3 py-2.5 text-xs font-bold text-primary-foreground shadow-glow transition-transform hover:scale-[1.02] sm:px-4 sm:py-3 sm:text-sm"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden sm:inline">Nouvelle séance</span>
          <span className="sm:hidden">Nouvelle</span>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatCard
          icon={Flame}
          label="Cette semaine"
          value={`${stats?.weekCount ?? 0}`}
          unit="séance(s)"
          accent
        />
        <StatCard icon={Activity} label="Total séances" value={`${stats?.totalCount ?? 0}`} unit="" />
        <StatCard
          icon={TrendingUp}
          label="Volume total"
          value={`${Math.round((stats?.totalVolume ?? 0) / 1000)}`}
          unit="t"
        />
      </div>

      <section>
        <h2 className="mb-4 text-lg font-semibold">Séances récentes</h2>
        {workouts && workouts.length > 0 ? (
          <div className="grid gap-3">
            {workouts.map((w) => (
              <WorkoutRow key={w.id} workout={w} />
            ))}
          </div>
        ) : (
          <EmptyCard
            title="Pas encore de séance"
            desc="Lance ta première session, on s'occupe du reste."
          />
        )}
      </section>
    </div>
  );
}

type WorkoutLite = { id: string; name: string; started_at: string; ended_at: string | null };

function WorkoutRow({ workout }: { workout: WorkoutLite }) {
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

  return (
    <>
      <div className="group relative flex items-center justify-between gap-2 rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40">
        <button
          onClick={() => navigate({ to: "/app/workout/$workoutId", params: { workoutId: workout.id } })}
          className="flex min-w-0 flex-1 items-center gap-4 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Calendar className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <div className="truncate font-semibold">{workout.name}</div>
            <div className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(workout.started_at), { addSuffix: true, locale: fr })}
            </div>
          </div>
        </button>
        <div ref={menuRef} className="relative shrink-0">
          <button
            onClick={() => setOpen((v) => !v)}
            className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Options"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
          {open && (
            <div className="absolute right-0 top-full z-10 mt-1 w-52 overflow-hidden rounded-md border border-border bg-card shadow-lg">
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
                  if (confirm(`Supprimer "${workout.name}" ?`)) delMut.mutate();
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" /> Supprimer
              </button>
            </div>
          )}
        </div>
      </div>
      {edit && <WorkoutEditDialog workout={workout} onClose={() => setEdit(false)} />}
    </>
  );
}

function WorkoutEditDialog({ workout, onClose }: { workout: WorkoutLite; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(workout.name);
  const [date, setDate] = useState(format(new Date(workout.started_at), "yyyy-MM-dd"));

  const mut = useMutation({
    mutationFn: async () => {
      const original = new Date(workout.started_at);
      const [y, m, d] = date.split("-").map(Number);
      const next = new Date(original);
      next.setFullYear(y, m - 1, d);
      const { error } = await supabase
        .from("workouts")
        .update({ name: name.trim(), started_at: next.toISOString() })
        .eq("id", workout.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Séance mise à jour");
      qc.invalidateQueries({ queryKey: ["workouts"] });
      qc.invalidateQueries({ queryKey: ["workout", workout.id] });
      qc.invalidateQueries({ queryKey: ["stats"] });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/90 p-4 backdrop-blur" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-5 shadow-card" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-4 text-lg font-bold">Modifier la séance</h2>
        <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">Nom</label>
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="mb-3 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        />
        <label className="mb-1.5 block text-xs font-semibold uppercase text-muted-foreground">Date</label>
        <input
          type="date"
          value={date}
          max={format(new Date(), "yyyy-MM-dd")}
          onChange={(e) => setDate(e.target.value)}
          className="mb-4 w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
        />
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 rounded-md border border-border py-2.5 text-sm font-semibold">
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

function StatCard({
  icon: Icon,
  label,
  value,
  unit,
  accent,
}: {
  icon: typeof Flame;
  label: string;
  value: string;
  unit: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${accent ? "text-accent" : "text-muted-foreground"}`} />
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className={`font-display text-3xl font-bold ${accent ? "text-gradient" : ""}`}>
          {value}
        </span>
        {unit && <span className="text-xs text-muted-foreground">{unit}</span>}
      </div>
    </div>
  );
}

function EmptyCard({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-lg border border-dashed border-border bg-card/50 p-8 text-center">
      <p className="font-semibold">{title}</p>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}
