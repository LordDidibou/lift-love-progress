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
  ReferenceDot,
} from "recharts";
import { format, subDays, startOfDay, startOfMonth, subMonths } from "date-fns";
import { fr } from "date-fns/locale";
import {
  Trophy,
  Activity,
  TrendingUp,
  Search,
  X,
  Star,
  ArrowUpRight,
  ArrowDownRight,
  Minus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { formatCompact } from "@/lib/formatNumber";

export const Route = createFileRoute("/app/stats")({
  component: StatsPage,
});

const RANGE_OPTIONS = [
  { value: 30, label: "1 mois" },
  { value: 90, label: "3 mois" },
  { value: 180, label: "6 mois" },
  { value: 360, label: "1 an" },
  { value: 9999, label: "Tout" },
] as const;

const SERIES_COLORS = [
  "oklch(0.88 0.22 130)",
  "oklch(0.72 0.20 30)",
  "oklch(0.70 0.20 260)",
  "oklch(0.75 0.22 330)",
  "oklch(0.78 0.18 80)",
];

const MAX_EXERCISES = 5;

const MUSCLE_GROUPS = [
  "Tous",
  "Pectoraux",
  "Dos",
  "Épaules",
  "Biceps",
  "Triceps",
  "Jambes",
  "Abdominaux",
  "Lombaires",
];

type WorkoutRow = {
  id: string;
  started_at: string;
  routine_id: string | null;
  workout_sets: { reps: number; weight: number; exercise_id: string; set_number: number }[];
};

type Tab = "exercise" | "routine";

function StatsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("exercise");

  // par exercice
  const [exerciseIds, setExerciseIds] = useState<string[]>([]);
  const [exerciseQuery, setExerciseQuery] = useState("");
  const [muscleFilter, setMuscleFilter] = useState<string>("Tous");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rangeDays, setRangeDays] = useState<number>(90);
  const [detailMetric, setDetailMetric] = useState<"weight" | "reps" | "volume">("weight");
  const searchRef = useRef<HTMLDivElement>(null);

  // par programme
  const [routineId, setRoutineId] = useState<string | null>(null);

  const { data: exercises = [] } = useQuery({
    queryKey: ["exercises"],
    queryFn: async () => {
      const { data, error } = await supabase.from("exercises").select("id, name, muscle_group").order("name");
      if (error) throw error;
      return data;
    },
  });

  const { data: routines = [] } = useQuery({
    queryKey: ["routines-list", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("routines")
        .select("id, name, position, routine_exercises(exercise_id, position)")
        .order("position", { ascending: true });
      if (error) throw error;
      return (data ?? []) as {
        id: string;
        name: string;
        routine_exercises: { exercise_id: string; position: number }[];
      }[];
    },
  });

  const { data: workouts = [], isLoading: loadingWorkouts } = useQuery({
    queryKey: ["stats", "workouts", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("workouts")
        .select("id, started_at, routine_id, workout_sets(reps, weight, exercise_id, set_number)")
        .eq("status", "completed")
        .order("started_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as WorkoutRow[];
    },
  });

  // Sélection auto du programme le plus récemment utilisé
  useEffect(() => {
    if (routineId || routines.length === 0 || workouts.length === 0) return;
    const recent = [...workouts].reverse().find((w) => w.routine_id);
    setRoutineId(recent?.routine_id ?? routines[0]?.id ?? null);
  }, [routines, workouts, routineId]);

  const filteredWorkouts = useMemo(() => {
    if (rangeDays >= 9999) return workouts;
    const since = subDays(new Date(), rangeDays).getTime();
    return workouts.filter((w) => new Date(w.started_at).getTime() >= since);
  }, [workouts, rangeDays]);

  const volumeByDay = useMemo(() => {
    const map = new Map<string, number>();
    const days = rangeDays >= 9999 ? 360 : rangeDays;
    const groupByWeek = days > 60;
    const buckets = groupByWeek ? Math.ceil(days / 7) : days;

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
      date: format(new Date(d), "d MMM", { locale: fr }),
      volume: Math.round(vol),
    }));
  }, [filteredWorkouts, rangeDays]);

  const totals = useMemo(() => {
    const totalSets = filteredWorkouts.reduce((a, w) => a + (w.workout_sets?.length ?? 0), 0);
    const totalVol = filteredWorkouts.reduce(
      (a, w) => a + (w.workout_sets ?? []).reduce((b, s) => b + Number(s.reps) * Number(s.weight), 0),
      0,
    );
    return { totalSets, totalVol: Math.round(totalVol) };
  }, [filteredWorkouts]);

  const rangeLabel = RANGE_OPTIONS.find((r) => r.value === rangeDays)?.label ?? `${rangeDays} j`;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Statistiques</h1>
        <p className="mt-1 text-sm text-muted-foreground">{rangeLabel}</p>
      </div>

      {/* Onglets principaux */}
      <div className="flex gap-2 rounded-xl border border-border bg-card p-1">
        <TabButton active={tab === "exercise"} onClick={() => setTab("exercise")}>
          Par exercice
        </TabButton>
        <TabButton active={tab === "routine"} onClick={() => setTab("routine")}>
          Par programme
        </TabButton>
      </div>

      {/* Filtre temporel global */}
      <div className="-mx-1 flex flex-wrap gap-1 px-1">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setRangeDays(opt.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              rangeDays === opt.value
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Card icon={Activity} label="Séances" value={`${filteredWorkouts.length}`} />
        <Card icon={Trophy} label="Séries" value={`${totals.totalSets}`} />
        <Card icon={TrendingUp} label="Volume (kg)" value={formatCompact(totals.totalVol)} accent />
      </div>

      {tab === "exercise" ? (
        <ExerciseTab
          loading={loadingWorkouts}
          exercises={exercises}
          filteredWorkouts={filteredWorkouts}
          volumeByDay={volumeByDay}
          rangeLabel={rangeLabel}
          exerciseIds={exerciseIds}
          setExerciseIds={setExerciseIds}
          exerciseQuery={exerciseQuery}
          setExerciseQuery={setExerciseQuery}
          muscleFilter={muscleFilter}
          setMuscleFilter={setMuscleFilter}
          showSuggestions={showSuggestions}
          setShowSuggestions={setShowSuggestions}
          searchRef={searchRef}
          detailMetric={detailMetric}
          setDetailMetric={setDetailMetric}
        />
      ) : (
        <RoutineTab
          loading={loadingWorkouts}
          routines={routines}
          exercises={exercises}
          workouts={filteredWorkouts}
          routineId={routineId}
          setRoutineId={setRoutineId}
          onPickExercise={(id) => {
            setExerciseIds([id]);
            setTab("exercise");
          }}
        />
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-bold transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

/* ────────── Onglet : Par exercice ────────── */

type ExerciseEntity = { id: string; name: string; muscle_group: string };

function ExerciseTab({
  loading,
  exercises,
  filteredWorkouts,
  volumeByDay,
  rangeLabel,
  exerciseIds,
  setExerciseIds,
  exerciseQuery,
  setExerciseQuery,
  muscleFilter,
  setMuscleFilter,
  showSuggestions,
  setShowSuggestions,
  searchRef,
  detailMetric,
  setDetailMetric,
}: {
  loading: boolean;
  exercises: ExerciseEntity[];
  filteredWorkouts: WorkoutRow[];
  volumeByDay: { date: string; volume: number }[];
  rangeLabel: string;
  exerciseIds: string[];
  setExerciseIds: (fn: (s: string[]) => string[]) => void;
  exerciseQuery: string;
  setExerciseQuery: (s: string) => void;
  muscleFilter: string;
  setMuscleFilter: (s: string) => void;
  showSuggestions: boolean;
  setShowSuggestions: (b: boolean) => void;
  searchRef: React.RefObject<HTMLDivElement | null>;
  detailMetric: "weight" | "reps" | "volume";
  setDetailMetric: (m: "weight" | "reps" | "volume") => void;
}) {
  const selectedExercises = useMemo(
    () => exerciseIds.map((id) => exercises.find((e) => e.id === id)).filter((e): e is ExerciseEntity => !!e),
    [exerciseIds, exercises],
  );

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

  const suggestions = useMemo(() => {
    const q = exerciseQuery.toLowerCase().trim();
    let base = exercises.filter((e) => !exerciseIds.includes(e.id));
    if (muscleFilter !== "Tous") base = base.filter((e) => e.muscle_group === muscleFilter);
    if (!q) return base.slice(0, 12);
    return base
      .filter((e) => e.name.toLowerCase().includes(q) || e.muscle_group.toLowerCase().includes(q))
      .slice(0, 15);
  }, [exercises, exerciseQuery, exerciseIds, muscleFilter]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(e.target as Node)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [searchRef, setShowSuggestions]);

  const canAddMore = exerciseIds.length < MAX_EXERCISES;
  const addExercise = (id: string) => {
    setExerciseIds((cur) => (cur.includes(id) || cur.length >= MAX_EXERCISES ? cur : [...cur, id]));
    setExerciseQuery("");
    setShowSuggestions(false);
  };
  const removeExercise = (id: string) => setExerciseIds((cur) => cur.filter((x) => x !== id));

  return (
    <>
      {/* Volume global */}
      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Volume — {rangeLabel}
        </h2>
        <div className="-mx-1 h-56 w-[calc(100%+0.5rem)] overflow-hidden sm:mx-0 sm:h-64 sm:w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={volumeByDay} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 240)" />
              <XAxis dataKey="date" tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 10 }} stroke="oklch(0.28 0.012 240)" interval="preserveStartEnd" minTickGap={12} />
              <YAxis tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 10 }} stroke="oklch(0.28 0.012 240)" width={40} />
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

          <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
            {MUSCLE_GROUPS.map((g) => (
              <button
                key={g}
                onClick={() => setMuscleFilter(g)}
                className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                  muscleFilter === g
                    ? "bg-primary text-primary-foreground"
                    : "border border-border bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                {g}
              </button>
            ))}
          </div>

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
              placeholder={canAddMore ? "Ajouter un exercice…" : `Maximum ${MAX_EXERCISES} exercices`}
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

        {/* Comparaison multi-exercices : graphe de poids max */}
        {exerciseIds.length > 1 && (
          <div className="h-72 w-full">
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
          </div>
        )}

        {/* Vue détaillée d'1 exercice */}
        {exerciseIds.length === 1 && (
          <ExerciseDetailView
            exercise={selectedExercises[0]}
            workouts={filteredWorkouts}
            metric={detailMetric}
            setMetric={setDetailMetric}
          />
        )}

        {exerciseIds.length === 0 && (
          <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
            {loading ? "Chargement…" : "Ajoute un exercice pour voir ta progression"}
          </div>
        )}
      </section>
    </>
  );
}

function ExerciseDetailView({
  exercise,
  workouts,
  metric,
  setMetric,
}: {
  exercise: ExerciseEntity;
  workouts: WorkoutRow[];
  metric: "weight" | "reps" | "volume";
  setMetric: (m: "weight" | "reps" | "volume") => void;
}) {
  const sessions = useMemo(() => {
    return workouts
      .map((w) => {
        const sets = (w.workout_sets ?? [])
          .filter((s) => s.exercise_id === exercise.id)
          .sort((a, b) => a.set_number - b.set_number);
        if (sets.length === 0) return null;
        const maxWeight = Math.max(...sets.map((s) => Number(s.weight)));
        const bestSet = sets.reduce((acc, s) =>
          Number(s.weight) * Number(s.reps) > Number(acc.weight) * Number(acc.reps) ? s : acc,
        );
        const maxReps = Math.max(...sets.map((s) => Number(s.reps)));
        const volume = sets.reduce((a, s) => a + Number(s.reps) * Number(s.weight), 0);
        return {
          workoutId: w.id,
          date: new Date(w.started_at),
          sets,
          maxWeight,
          maxReps,
          volume,
          bestSetIdx: sets.findIndex((s) => s === bestSet),
        };
      })
      .filter((x): x is NonNullable<typeof x> => !!x)
      .sort((a, b) => a.date.getTime() - b.date.getTime());
  }, [workouts, exercise.id]);

  const chartData = useMemo(
    () =>
      sessions.map((s) => ({
        date: format(s.date, "d MMM", { locale: fr }),
        weight: s.maxWeight,
        reps: s.maxReps,
        volume: Math.round(s.volume),
      })),
    [sessions],
  );

  const prIndex = useMemo(() => {
    if (sessions.length === 0) return -1;
    const key = metric === "weight" ? "maxWeight" : metric === "reps" ? "maxReps" : "volume";
    let best = -Infinity;
    let idx = -1;
    sessions.forEach((s, i) => {
      const v = (s as Record<string, number | unknown>)[key] as number;
      if (v > best) {
        best = v;
        idx = i;
      }
    });
    return idx;
  }, [sessions, metric]);

  const allTimePR = useMemo(() => {
    let best: { weight: number; reps: number } | null = null;
    sessions.forEach((s) => {
      s.sets.forEach((set) => {
        if (
          !best ||
          Number(set.weight) * Number(set.reps) > best.weight * best.reps ||
          (Number(set.weight) === best.weight && Number(set.reps) > best.reps)
        ) {
          best = { weight: Number(set.weight), reps: Number(set.reps) };
        }
      });
    });
    return best as { weight: number; reps: number } | null;
  }, [sessions]);

  const maxSets = sessions.reduce((a, s) => Math.max(a, s.sets.length), 0);

  if (sessions.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center text-center text-sm text-muted-foreground">
        Aucune séance enregistrée pour l'instant
      </div>
    );
  }

  const yKey = metric;
  const unit = metric === "reps" ? "reps" : "kg";
  const labelMap = { weight: "Poids max", reps: "Répétitions", volume: "Volume" } as const;

  return (
    <div className="space-y-4">
      <div className="flex gap-1 rounded-lg border border-border bg-background p-1">
        {(["weight", "reps", "volume"] as const).map((m) => (
          <button
            key={m}
            onClick={() => setMetric(m)}
            className={`flex-1 rounded-md px-2 py-1.5 text-xs font-semibold transition-colors ${
              metric === m
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {labelMap[m]}
          </button>
        ))}
      </div>

      <div className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 240)" />
            <XAxis dataKey="date" tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
            <YAxis tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" width={40} />
            <Tooltip
              contentStyle={{
                background: "oklch(0.18 0.012 240)",
                border: "1px solid oklch(0.28 0.012 240)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: unknown) => [`${v} ${unit}`, labelMap[metric]]}
            />
            <Line
              type="monotone"
              dataKey={yKey}
              stroke="oklch(0.88 0.22 130)"
              strokeWidth={2.5}
              dot={{ fill: "oklch(0.88 0.22 130)", r: 3 }}
            />
            {prIndex >= 0 && chartData[prIndex] && (
              <ReferenceDot
                x={chartData[prIndex].date}
                y={chartData[prIndex][yKey]}
                r={6}
                fill="oklch(0.72 0.19 45)"
                stroke="oklch(0.98 0.005 240)"
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {allTimePR && (
        <div className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2 text-xs">
          <Star className="h-4 w-4 text-accent" />
          <span className="font-semibold">Record absolu :</span>
          <span>
            {allTimePR.weight} kg × {allTimePR.reps} reps
          </span>
        </div>
      )}

      {/* Tableau détaillé */}
      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full text-xs">
          <thead className="bg-secondary text-muted-foreground">
            <tr>
              <th className="sticky left-0 bg-secondary px-2 py-2 text-left font-semibold">Date</th>
              {Array.from({ length: maxSets }).map((_, i) => (
                <th key={i} className="px-2 py-2 text-left font-semibold">
                  S{i + 1}
                </th>
              ))}
              <th className="px-2 py-2 text-right font-semibold">Volume</th>
            </tr>
          </thead>
          <tbody>
            {[...sessions].reverse().map((s, rowIdx) => {
              const isPR =
                allTimePR &&
                s.sets.some(
                  (set) =>
                    Number(set.weight) === allTimePR.weight && Number(set.reps) === allTimePR.reps,
                );
              return (
                <tr
                  key={s.workoutId}
                  className={rowIdx % 2 === 0 ? "bg-card" : "bg-background"}
                >
                  <td className="sticky left-0 bg-inherit px-2 py-1.5 font-medium whitespace-nowrap">
                    {format(s.date, "d MMM yy", { locale: fr })}
                    {isPR && <Star className="ml-1 inline h-3 w-3 text-accent" />}
                  </td>
                  {Array.from({ length: maxSets }).map((_, i) => {
                    const set = s.sets[i];
                    if (!set) return <td key={i} className="px-2 py-1.5 text-muted-foreground">—</td>;
                    const isBest = i === s.bestSetIdx;
                    return (
                      <td
                        key={i}
                        className={`px-2 py-1.5 whitespace-nowrap ${
                          isBest ? "font-bold text-primary" : ""
                        }`}
                      >
                        {Number(set.weight)}×{Number(set.reps)}
                      </td>
                    );
                  })}
                  <td className="px-2 py-1.5 text-right font-semibold">{Math.round(s.volume)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ────────── Onglet : Par programme ────────── */

function RoutineTab({
  loading,
  routines,
  exercises,
  workouts,
  routineId,
  setRoutineId,
  onPickExercise,
}: {
  loading: boolean;
  routines: { id: string; name: string; routine_exercises: { exercise_id: string; position: number }[] }[];
  exercises: ExerciseEntity[];
  workouts: WorkoutRow[];
  routineId: string | null;
  setRoutineId: (id: string) => void;
  onPickExercise: (id: string) => void;
}) {
  const routine = routines.find((r) => r.id === routineId);

  const routineWorkouts = useMemo(
    () => workouts.filter((w) => w.routine_id === routineId),
    [workouts, routineId],
  );

  const monthStart = startOfMonth(new Date()).getTime();
  const lastMonthStart = startOfMonth(subMonths(new Date(), 1)).getTime();

  const rows = useMemo(() => {
    if (!routine) return [];
    const exIds = [...routine.routine_exercises]
      .sort((a, b) => a.position - b.position)
      .map((re) => re.exercise_id);

    return exIds.map((exId) => {
      const ex = exercises.find((e) => e.id === exId);
      let bestMonth = 0;
      let bestAllTime = 0;
      let bestThisMonth = 0;
      let bestLastMonth = 0;
      workouts.forEach((w) => {
        const ts = new Date(w.started_at).getTime();
        (w.workout_sets ?? [])
          .filter((s) => s.exercise_id === exId)
          .forEach((s) => {
            const v = Number(s.weight) * Number(s.reps);
            if (v > bestAllTime) bestAllTime = v;
            if (ts >= monthStart) {
              if (v > bestMonth) bestMonth = v;
              if (v > bestThisMonth) bestThisMonth = v;
            } else if (ts >= lastMonthStart && ts < monthStart) {
              if (v > bestLastMonth) bestLastMonth = v;
            }
          });
      });
      const trend: "up" | "down" | "flat" =
        bestThisMonth > bestLastMonth * 1.02
          ? "up"
          : bestThisMonth < bestLastMonth * 0.98
            ? "down"
            : "flat";
      return {
        id: exId,
        name: ex?.name ?? "—",
        bestMonth: Math.round(bestMonth),
        bestAllTime: Math.round(bestAllTime),
        trend,
      };
    });
  }, [routine, exercises, workouts, monthStart, lastMonthStart]);

  const programVolumeChart = useMemo(() => {
    return routineWorkouts.map((w) => {
      const vol = (w.workout_sets ?? []).reduce(
        (a, s) => a + Number(s.reps) * Number(s.weight),
        0,
      );
      return {
        date: format(new Date(w.started_at), "d MMM", { locale: fr }),
        volume: Math.round(vol),
      };
    });
  }, [routineWorkouts]);

  if (loading) {
    return (
      <div className="rounded-xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
        Chargement…
      </div>
    );
  }

  if (routines.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
        Aucun programme enregistré
      </div>
    );
  }

  return (
    <>
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {routines.map((r) => (
          <button
            key={r.id}
            onClick={() => setRoutineId(r.id)}
            className={`shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              routineId === r.id
                ? "bg-primary text-primary-foreground"
                : "border border-border bg-background text-muted-foreground hover:text-foreground"
            }`}
          >
            {r.name}
          </button>
        ))}
      </div>

      <section className="rounded-xl border border-border bg-card p-3 shadow-card sm:p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          {routine?.name ?? "Programme"}
        </h2>

        {rows.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucun exercice dans ce programme
          </p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-xs">
              <thead className="bg-secondary text-muted-foreground">
                <tr>
                  <th className="px-2 py-2 text-left font-semibold">Exercice</th>
                  <th className="px-2 py-2 text-right font-semibold">Mois</th>
                  <th className="px-2 py-2 text-right font-semibold">All-time</th>
                  <th className="px-2 py-2 text-center font-semibold">Tend.</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    onClick={() => onPickExercise(r.id)}
                    className={`cursor-pointer transition-colors hover:bg-secondary/60 ${
                      i % 2 === 0 ? "bg-card" : "bg-background"
                    }`}
                  >
                    <td className="px-2 py-2 font-medium">{r.name}</td>
                    <td className="px-2 py-2 text-right">{r.bestMonth || "—"}</td>
                    <td className="px-2 py-2 text-right font-semibold">{r.bestAllTime || "—"}</td>
                    <td className="px-2 py-2 text-center">
                      {r.trend === "up" && (
                        <ArrowUpRight className="mx-auto h-4 w-4 text-success" />
                      )}
                      {r.trend === "down" && (
                        <ArrowDownRight className="mx-auto h-4 w-4 text-destructive" />
                      )}
                      {r.trend === "flat" && (
                        <Minus className="mx-auto h-4 w-4 text-muted-foreground" />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-xl border border-border bg-card p-4 shadow-card sm:p-5">
        <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Volume du programme
        </h2>
        {programVolumeChart.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            Aucune séance enregistrée pour ce programme
          </p>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={programVolumeChart} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 240)" />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
                <YAxis tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" width={40} />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.18 0.012 240)",
                    border: "1px solid oklch(0.28 0.012 240)",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: unknown) => [`${v} kg`, "Volume"]}
                />
                <Line
                  type="monotone"
                  dataKey="volume"
                  stroke="oklch(0.88 0.22 130)"
                  strokeWidth={2.5}
                  dot={{ fill: "oklch(0.88 0.22 130)", r: 3 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>
    </>
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
      <div className={`mt-2 truncate font-display text-2xl font-bold leading-tight ${accent ? "text-gradient" : ""}`}>{value}</div>
    </div>
  );
}
