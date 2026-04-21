import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  BarChart,
  Bar,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Trophy, Activity, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/stats")({
  component: StatsPage,
});

function StatsPage() {
  const { user } = useAuth();
  const [exerciseId, setExerciseId] = useState<string | "">("");

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("id, name").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: workouts = [] } = useQuery({
    queryKey: ["stats", "workouts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = subDays(new Date(), 60);
      const { data, error } = await supabase
        .from("workouts")
        .select("id, started_at, workout_sets(reps, weight, exercise_id)")
        .gte("started_at", since.toISOString())
        .order("started_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const volumeByDay = useMemo(() => {
    const map = new Map<string, number>();
    for (let i = 13; i >= 0; i--) {
      const d = format(startOfDay(subDays(new Date(), i)), "yyyy-MM-dd");
      map.set(d, 0);
    }
    workouts.forEach((w) => {
      const d = format(startOfDay(new Date(w.started_at)), "yyyy-MM-dd");
      if (!map.has(d)) return;
      const vol = (w.workout_sets ?? []).reduce((a, s) => a + Number(s.reps) * Number(s.weight), 0);
      map.set(d, (map.get(d) ?? 0) + vol);
    });
    return Array.from(map.entries()).map(([d, vol]) => ({
      date: format(new Date(d), "d MMM", { locale: fr }),
      volume: Math.round(vol),
    }));
  }, [workouts]);

  const exerciseProgress = useMemo(() => {
    if (!exerciseId) return [];
    const points: { date: string; max: number }[] = [];
    workouts.forEach((w) => {
      const sets = (w.workout_sets ?? []).filter((s) => s.exercise_id === exerciseId);
      if (sets.length === 0) return;
      const max = Math.max(...sets.map((s) => Number(s.weight)));
      points.push({ date: format(new Date(w.started_at), "d MMM", { locale: fr }), max });
    });
    return points;
  }, [workouts, exerciseId]);

  const totals = useMemo(() => {
    const totalSets = workouts.reduce((a, w) => a + (w.workout_sets?.length ?? 0), 0);
    const totalVol = workouts.reduce(
      (a, w) => a + (w.workout_sets ?? []).reduce((b, s) => b + Number(s.reps) * Number(s.weight), 0),
      0,
    );
    return { totalSets, totalVol: Math.round(totalVol) };
  }, [workouts]);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Statistiques</h1>
        <p className="mt-1 text-sm text-muted-foreground">60 derniers jours</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card icon={Activity} label="Séances" value={`${workouts.length}`} />
        <Card icon={Trophy} label="Séries" value={`${totals.totalSets}`} />
        <Card icon={TrendingUp} label="Volume (kg)" value={`${totals.totalVol.toLocaleString("fr-FR")}`} accent />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Volume — 14 derniers jours
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={volumeByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 240)" />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
              <YAxis tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
              <Tooltip
                contentStyle={{
                  background: "oklch(0.18 0.012 240)",
                  border: "1px solid oklch(0.28 0.012 240)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
              />
              <Bar dataKey="volume" fill="oklch(0.88 0.22 130)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Progression par exercice
          </h2>
          <select
            value={exerciseId}
            onChange={(e) => setExerciseId(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-xs"
          >
            <option value="">Choisir…</option>
            {exercises.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        </div>
        <div className="h-64">
          {exerciseProgress.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={exerciseProgress}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 240)" />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
                <YAxis tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.18 0.012 240)",
                    border: "1px solid oklch(0.28 0.012 240)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="max"
                  stroke="oklch(0.88 0.22 130)"
                  strokeWidth={3}
                  dot={{ fill: "oklch(0.88 0.22 130)", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Sélectionne un exercice pour voir ta progression
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function Card({
  icon: Icon,
  label,
  value,
  accent,
}: {
  icon: typeof Activity;
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4 shadow-card">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className={`h-4 w-4 ${accent ? "text-accent" : "text-muted-foreground"}`} />
      </div>
      <div className={`mt-2 font-display text-2xl font-bold ${accent ? "text-gradient" : ""}`}>{value}</div>
    </div>
  );
}
