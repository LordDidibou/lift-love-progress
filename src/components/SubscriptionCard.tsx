import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  CreditCard,
  Pencil,
  Check,
  X,
  TrendingUp,
} from "lucide-react";
import { format, parseISO, startOfYear, getMonth, getDaysInYear, differenceInCalendarDays } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DecimalInput } from "@/components/DecimalInput";

type Settings = {
  monthlyPrice: number;
  yearlyPrice: number;
  renewedAt: string; // début du cycle mensuel
  targetPerSession: number;
  soloSessionPrice: number; // 0 = non défini
};

const STORAGE_KEY = "subscription-settings-v2";

const defaults: Settings = {
  monthlyPrice: 40,
  yearlyPrice: 480,
  renewedAt: format(new Date(), "yyyy-MM-dd"),
  targetPerSession: 5,
  soloSessionPrice: 15,
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // migration v1 → v2
      const old = localStorage.getItem("subscription-settings-v1");
      if (old) {
        const parsed = JSON.parse(old);
        const monthly = Number(parsed.price) || defaults.monthlyPrice;
        return {
          ...defaults,
          monthlyPrice: monthly,
          yearlyPrice: +(monthly * 12).toFixed(2),
          renewedAt: parsed.renewedAt ?? defaults.renewedAt,
          targetPerSession: Number(parsed.targetPerSession) || defaults.targetPerSession,
        };
      }
      return defaults;
    }
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

function fmtEuro(n: number, decimals = 2): string {
  return `${n.toFixed(decimals).replace(".", ",")} €`;
}

type Status = "green" | "orange" | "red";
function statusFromRatio(pricePerSession: number | null, target: number): Status {
  if (pricePerSession === null) return "red";
  if (pricePerSession <= target) return "green";
  if (pricePerSession <= target * 1.34) return "orange"; // ~75% du seuil atteint
  return "red";
}

const STATUS_COLOR: Record<Status, string> = {
  green: "text-success",
  orange: "text-accent",
  red: "text-destructive",
};
const STATUS_BAR: Record<Status, string> = {
  green: "bg-success",
  orange: "bg-accent",
  red: "bg-destructive",
};
const STATUS_DOT: Record<Status, string> = {
  green: "🟢",
  orange: "🟡",
  red: "🔴",
};
const STATUS_LABEL: Record<Status, string> = {
  green: "Rentabilisé",
  orange: "En cours",
  red: "Non rentabilisé",
};

export function SubscriptionCard() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Settings>(defaults);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  // ── Séances depuis le renouvellement (mois) ──
  const { data: monthSessions = 0 } = useQuery({
    queryKey: ["sub-month-sessions", user?.id, settings.renewedAt],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("workouts")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("started_at", `${settings.renewedAt}T00:00:00`);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // ── Séances de l'année en cours ──
  const yearStart = format(startOfYear(new Date()), "yyyy-MM-dd");
  const { data: yearSessions = 0 } = useQuery({
    queryKey: ["sub-year-sessions", user?.id, yearStart],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("workouts")
        .select("id", { count: "exact", head: true })
        .eq("status", "completed")
        .gte("started_at", `${yearStart}T00:00:00`);
      if (error) throw error;
      return count ?? 0;
    },
  });

  // ── Calculs mensuels ──
  const monthPricePerSession =
    monthSessions > 0 ? settings.monthlyPrice / monthSessions : null;
  const monthBreakeven =
    settings.targetPerSession > 0
      ? Math.ceil(settings.monthlyPrice / settings.targetPerSession)
      : 0;
  const monthProgress =
    monthBreakeven > 0 ? Math.min(1, monthSessions / monthBreakeven) : 0;
  const monthStatus: Status = useMemo(() => {
    if (monthSessions >= monthBreakeven && monthBreakeven > 0) return "green";
    if (monthProgress >= 0.75) return "orange";
    return "red";
  }, [monthSessions, monthBreakeven, monthProgress]);

  const monthSavings =
    settings.soloSessionPrice > 0 && monthSessions > 0
      ? Math.max(0, monthSessions * settings.soloSessionPrice - settings.monthlyPrice)
      : 0;

  // ── Calculs annuels ──
  const today = new Date();
  const monthsElapsed = getMonth(today) + (today.getDate() / 31); // approx fractionné
  const avgPerMonth = monthsElapsed > 0 ? yearSessions / monthsElapsed : 0;
  const daysIntoYear = differenceInCalendarDays(today, startOfYear(today)) + 1;
  const totalDaysInYear = getDaysInYear(today);
  const projectedSessions =
    daysIntoYear > 0 ? Math.round((yearSessions / daysIntoYear) * totalDaysInYear) : 0;
  const yearPricePerSession =
    yearSessions > 0 ? settings.yearlyPrice / yearSessions : null;
  const projectedPricePerSession =
    projectedSessions > 0 ? settings.yearlyPrice / projectedSessions : null;
  const yearBreakeven =
    settings.targetPerSession > 0
      ? Math.ceil(settings.yearlyPrice / settings.targetPerSession)
      : 0;
  const yearProgress =
    yearBreakeven > 0 ? Math.min(1, yearSessions / yearBreakeven) : 0;
  const yearStatus: Status = useMemo(() => {
    // Au prorata du temps écoulé dans l'année
    const expected = yearBreakeven * (daysIntoYear / totalDaysInYear);
    if (yearSessions >= expected && yearBreakeven > 0) return "green";
    if (expected > 0 && yearSessions >= expected * 0.75) return "orange";
    return "red";
  }, [yearSessions, yearBreakeven, daysIntoYear, totalDaysInYear]);

  // ── Édition ──
  const startEdit = () => {
    setDraft(settings);
    setEditing(true);
  };
  const saveEdit = () => {
    const clean: Settings = {
      monthlyPrice: Math.max(0, Number(draft.monthlyPrice) || 0),
      yearlyPrice: Math.max(0, Number(draft.yearlyPrice) || 0),
      renewedAt: draft.renewedAt || defaults.renewedAt,
      targetPerSession: Math.max(0.01, Number(draft.targetPerSession) || defaults.targetPerSession),
      soloSessionPrice: Math.max(0, Number(draft.soloSessionPrice) || 0),
    };
    setSettings(clean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    setEditing(false);
  };

  const setMonthly = (v: number) =>
    setDraft((d) => ({
      ...d,
      monthlyPrice: v,
      yearlyPrice: +(v * 12).toFixed(2),
    }));
  const setYearly = (v: number) =>
    setDraft((d) => ({
      ...d,
      yearlyPrice: v,
      monthlyPrice: +(v / 12).toFixed(2),
    }));

  return (
    <section className="space-y-4">
      {/* ──────────────── EN-TÊTE / RÉGLAGES ──────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold">Mon abonnement</h2>
          </div>
          {!editing && (
            <button
              onClick={startEdit}
              className="flex items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <Pencil className="h-3.5 w-3.5" /> Modifier
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Prix mensuel (€/mois)
                </label>
                <DecimalInput
                  value={draft.monthlyPrice}
                  onValueChange={setMonthly}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Prix annuel (€/an)
                </label>
                <DecimalInput
                  value={draft.yearlyPrice}
                  onValueChange={setYearly}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Les deux champs se synchronisent automatiquement (× 12 / ÷ 12).
            </p>
            <div>
              <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                Date du dernier renouvellement
              </label>
              <input
                type="date"
                value={draft.renewedAt}
                onChange={(e) => setDraft((d) => ({ ...d, renewedAt: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Objectif €/séance
                </label>
                <DecimalInput
                  value={draft.targetPerSession}
                  onValueChange={(v) => setDraft((d) => ({ ...d, targetPerSession: v }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Séance à l'unité (€)
                </label>
                <DecimalInput
                  value={draft.soloSessionPrice}
                  onValueChange={(v) => setDraft((d) => ({ ...d, soloSessionPrice: v }))}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
            </div>
            <div className="flex gap-2 pt-1">
              <button
                onClick={saveEdit}
                className="flex flex-1 items-center justify-center gap-1.5 rounded-md bg-gradient-primary py-2 text-sm font-bold text-primary-foreground"
              >
                <Check className="h-4 w-4" /> Enregistrer
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center justify-center gap-1.5 rounded-md border border-border bg-background px-3 py-2 text-sm font-semibold text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" /> Annuler
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md bg-secondary p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                Mensuel
              </p>
              <p className="font-display text-xl font-bold">{fmtEuro(settings.monthlyPrice, 0)}</p>
            </div>
            <div className="rounded-md bg-secondary p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">
                Annuel
              </p>
              <p className="font-display text-xl font-bold">{fmtEuro(settings.yearlyPrice, 0)}</p>
            </div>
            <div className="col-span-2 flex items-center gap-1.5 text-xs text-muted-foreground">
              <CalendarDays className="h-3.5 w-3.5" />
              Renouvellement : {format(parseISO(settings.renewedAt), "d MMMM yyyy", { locale: fr })}
              <span className="ml-auto">
                Objectif : {fmtEuro(settings.targetPerSession)} / séance
              </span>
            </div>
          </div>
        )}
      </div>

      {!editing && (
        <>
          {/* ──────────────── CE MOIS-CI ──────────────── */}
          <PeriodCard
            title="Ce mois-ci"
            subtitle={`Depuis le ${format(parseISO(settings.renewedAt), "d MMMM", { locale: fr })}`}
            sessions={monthSessions}
            pricePerSession={monthPricePerSession}
            breakeven={monthBreakeven}
            progress={monthProgress}
            status={monthStatus}
            extra={
              <>
                {monthSavings > 0 && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-success">
                    <TrendingUp className="h-3.5 w-3.5" />
                    Tu économises {fmtEuro(monthSavings, 0)} vs séances à l'unité
                  </p>
                )}
              </>
            }
          />

          {/* ──────────────── CETTE ANNÉE ──────────────── */}
          <PeriodCard
            title="Cette année"
            subtitle={`Depuis le 1ᵉʳ janvier ${today.getFullYear()}`}
            sessions={yearSessions}
            pricePerSession={yearPricePerSession}
            breakeven={yearBreakeven}
            progress={yearProgress}
            status={yearStatus}
            extra={
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Moy./mois</p>
                  <p className="font-bold">{avgPerMonth.toFixed(1)}</p>
                </div>
                <div className="rounded-md bg-secondary p-2">
                  <p className="text-[10px] uppercase text-muted-foreground">Projection an</p>
                  <p className="font-bold">{projectedSessions} séances</p>
                </div>
                {projectedPricePerSession !== null && (
                  <div className="col-span-2 rounded-md bg-secondary p-2">
                    <p className="text-[10px] uppercase text-muted-foreground">
                      À ce rythme
                    </p>
                    <p className="font-semibold">
                      {projectedSessions} séances → {fmtEuro(projectedPricePerSession)} / séance
                    </p>
                  </div>
                )}
              </div>
            }
          />
        </>
      )}
    </section>
  );
}

function PeriodCard({
  title,
  subtitle,
  sessions,
  pricePerSession,
  breakeven,
  progress,
  status,
  extra,
}: {
  title: string;
  subtitle: string;
  sessions: number;
  pricePerSession: number | null;
  breakeven: number;
  progress: number;
  status: Status;
  extra?: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-5 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-base font-bold">{title}</h3>
          <p className="text-[11px] text-muted-foreground">{subtitle}</p>
        </div>
        <span className="text-xs font-semibold text-muted-foreground">
          {STATUS_DOT[status]} {STATUS_LABEL[status]}
        </span>
      </div>

      <div className="rounded-lg bg-secondary p-5 text-center">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
          Prix par séance
        </p>
        <p className={`font-display text-5xl font-bold ${STATUS_COLOR[status]}`}>
          {pricePerSession !== null ? fmtEuro(pricePerSession) : "—"}
        </p>

        {/* Barre de progression */}
        <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background">
          <div
            className={`h-full ${STATUS_BAR[status]} transition-all`}
            style={{ width: `${Math.round(progress * 100)}%` }}
          />
        </div>
        <p className="mt-2 text-[11px] text-muted-foreground">
          {sessions} / {breakeven} séances pour rentabiliser
        </p>
      </div>

      {extra}
    </div>
  );
}
