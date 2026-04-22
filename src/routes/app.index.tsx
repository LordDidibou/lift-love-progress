import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus, Activity, TrendingUp, Calendar, Flame } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

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
              <Link
                key={w.id}
                to="/app/workout/$workoutId"
                params={{ workoutId: w.id }}
                className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40"
              >
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
                    <Calendar className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-semibold">{w.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(w.started_at), { addSuffix: true, locale: fr })}
                    </div>
                  </div>
                </div>
                <span className="text-xs font-semibold text-primary opacity-0 transition-opacity group-hover:opacity-100">
                  Voir →
                </span>
              </Link>
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
