import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState, useRef, useEffect } from "react";
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
  Legend,
} from "recharts";
import { format, subDays, startOfDay } from "date-fns";
import { fr } from "date-fns/locale";
import { Trophy, Activity, TrendingUp, Search, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/stats")({
  component: StatsPage,
});

const RANGE_OPTIONS = [
  { value: 7, label: "7 j" },
  { value: 14, label: "14 j" },
  { value: 30, label: "30 j" },
  { value: 60, label: "60 j" },
  { value: 90, label: "90 j" },
  { value: 180, label: "6 mois" },
  { value: 360, label: "1 an" },
] as const;

const SERIES_COLORS = [
  "oklch(0.88 0.22 130)",
  "oklch(0.72 0.20 30)",
  "oklch(0.70 0.20 260)",
  "oklch(0.75 0.22 330)",
  "oklch(0.78 0.18 80)",
];

const MAX_EXERCISES = 5;

function StatsPage() {
  const { user } = useAuth();
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rangeDays, setRangeDays] = useState<number>(14);
  const searchRef = useRef<HTMLDivElement>(null);

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("id, name, muscle_group").order("name");
      if (error) throw error;
      return data;
    },
  });

  // Charge sur la plus longue plage potentielle pour pouvoir changer sans refetch
  const { data: workouts = [] } = useQuery({
    queryKey: ["stats", "workouts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const since = subDays(new Date(), 365);
      const { data, error } = await supabase
        .from("workouts")
        .select("id, started_at, workout_sets(reps, weight, exercise_id)")
        .gte("started_at", since.toISOString())
        .order("started_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // Filtrer les workouts selon la durée choisie
  const filteredWorkouts = useMemo(() => {
    const since = subDays(new Date(), rangeDays).getTime();
    return workouts.filter((w) => new Date(w.started_at).getTime() >= since);
  }, [workouts, rangeDays]);

  const volumeByDay = useMemo(() => {
    const map = new Map<string, number>();
    // Agrégation par jour si <= 60j, sinon par semaine pour rester lisible
    const groupByWeek = rangeDays > 60;
    const buckets = groupByWeek ? Math.ceil(rangeDays / 7) : rangeDays;

    for (let i = buckets - 1; i >= 0; i--) {
      const d = groupByWeek
        ? format(startOfDay(subDays(new Date(), i * 7)), "yyyy-MM-dd")
        : format(startOfDay(subDays(new Date(), i)), "yyyy-MM-dd");
      map.set(d, 0);
    }

    filteredWorkouts.forEach((w) => {
      const date = startOfDay(new Date(w.started_at));
      let key: string;
      if (groupByWeek) {
        const daysAgo = Math.floor((Date.now() - date.getTime()) / (1000 * 60 * 60 * 24));
        const weekIdx = Math.floor(daysAgo / 7);
        key = format(startOfDay(subDays(new Date(), weekIdx * 7)), "yyyy-MM-dd");
      } else {
        key = format(date, "yyyy-MM-dd");
      }
      if (!map.has(key)) return;
      const vol = (w.workout_sets ?? []).reduce((a, s) => a + Number(s.reps) * Number(s.weight), 0);
      map.set(key, (map.get(key) ?? 0) + vol);
    });

    return Array.from(map.entries()).map(([d, vol]) => ({
      date: format(new Date(d), groupByWeek || rangeDays > 30 ? "d MMM" : "d MMM", { locale: fr }),
      volume: Math.round(vol),
    }));
  }, [filteredWorkouts, rangeDays]);

  // Pour chaque exercice sélectionné, on construit une série de points {date, [name]: max}
  // puis on fusionne par date pour Recharts.
  const exerciseProgress = useMemo(() => {
    if (exerciseIds.length === 0) return [] as Array<Record<string, string | number>>;
    const byDate = new Map<string, Record<string, string | number>>();
    filteredWorkouts.forEach((w) => {
      const dateKey = format(new Date(w.started_at), "yyyy-MM-dd");
      const dateLabel = format(new Date(w.started_at), "d MMM", { locale: fr });
      exerciseIds.forEach((exId) => {
        const sets = (w.workout_sets ?? []).filter((s) => s.exercise_id === exId);
        if (sets.length === 0) return;
        const max = Math.max(...sets.map((s) => Number(s.weight)));
        const existing = byDate.get(dateKey) ?? { date: dateLabel };
        const exName = exercises.find((e) => e.id === exId)?.name ?? exId;
        existing[exName] = max;
        byDate.set(dateKey, existing);
      });
    });
    return Array.from(byDate.entries())
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([, v]) => v);
  }, [filteredWorkouts, exerciseIds, exercises]);

  const selectedExercises = useMemo(
    () =>
      exerciseIds
        .map((id) => exercises.find((e) => e.id === id))
        .filter((e): e is { id: string; name: string; muscle_group: string } => !!e),
    [exerciseIds, exercises],
  );

  const totals = useMemo(() => {
    const totalSets = filteredWorkouts.reduce((a, w) => a + (w.workout_sets?.length ?? 0), 0);
    const totalVol = filteredWorkouts.reduce(
      (a, w) => a + (w.workout_sets ?? []).reduce((b, s) => b + Number(s.reps) * Number(s.weight), 0),
      0,
    );
    return { totalSets, totalVol: Math.round(totalVol) };
  }, [filteredWorkouts]);

  // Suggestions d'exercices (en excluant ceux déjà choisis)
  const suggestions = useMemo(() => {
    const q = exerciseQuery.toLowerCase().trim();
    const base = exercises.filter((e) => !exerciseIds.includes(e.id));
    if (!q) return base.slice(0, 8);
    return base
      .filter((e) => e.name.toLowerCase().includes(q) || e.muscle_group.toLowerCase().includes(q))
      .slice(0, 10);
  }, [exercises, exerciseQuery, exerciseIds]);

  // Fermer suggestions au clic extérieur
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === rangeDays)?.label ?? `${rangeDays} j`;
  const canAddMore = exerciseIds.length < MAX_EXERCISES;

  const addExercise = (id: string) => {
    setExerciseIds((cur) => (cur.includes(id) || cur.length >= MAX_EXERCISES ? cur : [...cur, id]));
    setExerciseQuery("");
    setShowSuggestions(false);
  };
  const removeExercise = (id: string) => {
    setExerciseIds((cur) => cur.filter((x) => x !== id));
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Statistiques</h1>
        <p className="mt-1 text-sm text-muted-foreground">{rangeLabel}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card icon={Activity} label="Séances" value={`${filteredWorkouts.length}`} />
        <Card icon={Trophy} label="Séries" value={`${totals.totalSets}`} />
        <Card icon={TrendingUp} label="Volume (kg)" value={`${totals.totalVol.toLocaleString("fr-FR")}`} accent />
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Volume — {rangeLabel}
          </h2>
          <div className="flex flex-wrap gap-1">
            {RANGE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => setRangeDays(opt.value)}
                className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
                  rangeDays === opt.value
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
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

      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <div className="mb-4 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
              Progression par exercice
            </h2>
            <span className="text-[10px] text-muted-foreground">
              {exerciseIds.length}/{MAX_EXERCISES}
            </span>
          </div>

          {selectedExercises.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {selectedExercises.map((ex, idx) => (
                <span
                  key={ex.id}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-2.5 py-1 text-xs"
                >
                  <span
                    className="h-2 w-2 rounded-full"
                    style={{ background: SERIES_COLORS[idx % SERIES_COLORS.length] }}
                  />
                  <span className="max-w-[140px] truncate">{ex.name}</span>
                  <button
                    onClick={() => removeExercise(ex.id)}
                    className="text-muted-foreground hover:text-foreground"
                    aria-label="Retirer"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <div ref={searchRef} className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              value={exerciseQuery}
              onChange={(e) => {
                setExerciseQuery(e.target.value);
                setShowSuggestions(true);
              }}
              onFocus={() => setShowSuggestions(true)}
              disabled={!canAddMore}
              placeholder={
                canAddMore
                  ? "Ajouter un exercice à comparer…"
                  : `Maximum ${MAX_EXERCISES} exercices`
              }
              className="w-full rounded-md border border-input bg-background py-2 pl-10 pr-9 text-sm focus:border-primary focus:outline-none disabled:opacity-50"
            />
            {exerciseQuery && (
              <button
                onClick={() => {
                  setExerciseQuery("");
                  setShowSuggestions(false);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                aria-label="Effacer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
            {showSuggestions && canAddMore && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-64 overflow-y-auto rounded-md border border-border bg-card shadow-lg">
                {suggestions.map((e) => (
                  <button
                    key={e.id}
                    onClick={() => addExercise(e.id)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-secondary"
                  >
                    <span className="truncate">{e.name}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{e.muscle_group}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
        <div className="h-72 w-full">
          {exerciseProgress.length > 0 ? (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={exerciseProgress} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 240)" />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
                <YAxis tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" width={36} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.18 0.012 240)",
                    border: "1px solid oklch(0.28 0.012 240)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {selectedExercises.map((ex, idx) => {
                  const color = SERIES_COLORS[idx % SERIES_COLORS.length];
                  return (
                    <Line
                      key={ex.id}
                      type="monotone"
                      dataKey={ex.name}
                      stroke={color}
                      strokeWidth={2.5}
                      dot={{ fill: color, r: 3 }}
                      connectNulls
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center text-center text-sm text-muted-foreground">
              {exerciseIds.length > 0
                ? "Aucune donnée pour ces exercices sur la période"
                : "Ajoute un exercice pour voir ta progression"}
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
