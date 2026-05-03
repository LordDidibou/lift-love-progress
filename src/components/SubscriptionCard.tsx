import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CalendarDays, CreditCard, Pencil, Check, X } from "lucide-react";
import { format, parseISO } from "date-fns";
import { fr } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { DecimalInput } from "@/components/DecimalInput";

type Settings = {
  price: number;        // prix abonnement (€)
  renewedAt: string;    // ISO date (yyyy-mm-dd)
  targetPerSession: number; // €/séance cible
};

const STORAGE_KEY = "subscription-settings-v1";

const defaults: Settings = {
  price: 40,
  renewedAt: format(new Date(), "yyyy-MM-dd"),
  targetPerSession: 5,
};

function loadSettings(): Settings {
  if (typeof window === "undefined") return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    return { ...defaults, ...JSON.parse(raw) };
  } catch {
    return defaults;
  }
}

export function SubscriptionCard() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Settings>(defaults);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Settings>(defaults);

  useEffect(() => {
    setSettings(loadSettings());
  }, []);

  const { data: sessionsCount = 0 } = useQuery({
    queryKey: ["subscription-sessions", user?.id, settings.renewedAt],
    enabled: !!user,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("workouts")
        .select("id", { count: "exact", head: true })
        .gte("started_at", `${settings.renewedAt}T00:00:00`);
      if (error) throw error;
      return count ?? 0;
    },
  });

  const pricePerSession = sessionsCount > 0 ? settings.price / sessionsCount : null;
  const breakeven = settings.targetPerSession > 0
    ? Math.ceil(settings.price / settings.targetPerSession)
    : 0;

  const status: "green" | "orange" | "red" = useMemo(() => {
    if (pricePerSession === null) return "red";
    if (pricePerSession <= settings.targetPerSession) return "green";
    if (sessionsCount >= breakeven * 0.5) return "orange";
    return "red";
  }, [pricePerSession, settings.targetPerSession, sessionsCount, breakeven]);

  const colorClass =
    status === "green" ? "text-success" : status === "orange" ? "text-accent" : "text-destructive";
  const dot =
    status === "green" ? "🟢" : status === "orange" ? "🟠" : "🔴";

  const startEdit = () => {
    setDraft(settings);
    setEditing(true);
  };
  const saveEdit = () => {
    const clean: Settings = {
      price: Math.max(0, Number(draft.price) || 0),
      renewedAt: draft.renewedAt || defaults.renewedAt,
      targetPerSession: Math.max(0.01, Number(draft.targetPerSession) || defaults.targetPerSession),
    };
    setSettings(clean);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    setEditing(false);
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-card">
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
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Prix de l'abonnement (€)
            </label>
            <DecimalInput
              value={draft.price}
              onValueChange={(v) => setDraft((d) => ({ ...d, price: v }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Date du dernier renouvellement
            </label>
            <input
              type="date"
              value={draft.renewedAt}
              onChange={(e) => setDraft((d) => ({ ...d, renewedAt: e.target.value }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Objectif prix / séance (€)
            </label>
            <DecimalInput
              value={draft.targetPerSession}
              onValueChange={(v) => setDraft((d) => ({ ...d, targetPerSession: v }))}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
            />
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
        <>
          <div className="rounded-lg bg-secondary p-5 text-center">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Prix par séance
            </p>
            <p className={`font-display text-5xl font-bold ${colorClass}`}>
              {pricePerSession !== null ? `${pricePerSession.toFixed(2)} €` : "—"}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {dot} Objectif : {settings.targetPerSession.toFixed(2)} €/séance
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="rounded-md bg-secondary p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Abonnement</p>
              <p className="font-display text-xl font-bold">{settings.price.toFixed(0)} €</p>
            </div>
            <div className="rounded-md bg-secondary p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Séances</p>
              <p className="font-display text-xl font-bold">{sessionsCount}</p>
            </div>
            <div className="rounded-md bg-secondary p-3">
              <p className="text-[10px] font-semibold uppercase text-muted-foreground">Rentable à</p>
              <p className="font-display text-xl font-bold">{breakeven}</p>
            </div>
          </div>

          <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
            <CalendarDays className="h-3.5 w-3.5" />
            Depuis le {format(parseISO(settings.renewedAt), "d MMMM yyyy", { locale: fr })}
          </p>
        </>
      )}
    </section>
  );
}
