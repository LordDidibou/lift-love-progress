import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Scale, Plus, Trash2 } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [weight, setWeight] = useState("");

  const { data: weights = [] } = useQuery({
    queryKey: ["body_weights", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("body_weights")
        .select("*")
        .order("measured_at", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  const addMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non connecté");
      const w = Number(weight);
      if (!w || w <= 0) throw new Error("Poids invalide");
      const { error } = await supabase.from("body_weights").insert({ user_id: user.id, weight: w });
      if (error) throw error;
    },
    onSuccess: () => {
      setWeight("");
      toast.success("Poids enregistré");
      qc.invalidateQueries({ queryKey: ["body_weights"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("body_weights").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["body_weights"] }),
  });

  const chartData = weights.map((w) => ({
    date: format(new Date(w.measured_at), "d MMM", { locale: fr }),
    weight: Number(w.weight),
  }));

  const last = weights[weights.length - 1];
  const first = weights[0];
  const delta = last && first ? Number(last.weight) - Number(first.weight) : 0;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Profil</h1>
        <p className="mt-1 text-sm text-muted-foreground">{user?.email}</p>
      </div>

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <Scale className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Poids corporel</h2>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-md bg-secondary p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Actuel</p>
            <p className="font-display text-2xl font-bold">{last ? `${last.weight} kg` : "—"}</p>
          </div>
          <div className="rounded-md bg-secondary p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Évolution</p>
            <p className={`font-display text-2xl font-bold ${delta < 0 ? "text-success" : delta > 0 ? "text-accent" : ""}`}>
              {delta > 0 ? "+" : ""}
              {delta.toFixed(1)} kg
            </p>
          </div>
          <div className="rounded-md bg-secondary p-3">
            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Mesures</p>
            <p className="font-display text-2xl font-bold">{weights.length}</p>
          </div>
        </div>

        <div className="mt-5 flex gap-2">
          <input
            type="number"
            step="0.1"
            placeholder="Ton poids (kg)"
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            className="flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => addMut.mutate()}
            disabled={addMut.isPending || !weight}
            className="flex items-center gap-2 rounded-md bg-gradient-primary px-4 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> Ajouter
          </button>
        </div>

        {chartData.length >= 2 && (
          <div className="mt-6 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 240)" />
                <XAxis dataKey="date" tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
                <YAxis domain={["auto", "auto"]} tick={{ fill: "oklch(0.65 0.02 240)", fontSize: 11 }} stroke="oklch(0.28 0.012 240)" />
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
                  dataKey="weight"
                  stroke="oklch(0.88 0.22 130)"
                  strokeWidth={3}
                  dot={{ fill: "oklch(0.88 0.22 130)", r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}

        {weights.length > 0 && (
          <div className="mt-6 space-y-1">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Historique
            </p>
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {[...weights].reverse().map((w) => (
                <div
                  key={w.id}
                  className="flex items-center justify-between rounded-md border border-border bg-background px-3 py-2"
                >
                  <span className="text-sm">{format(new Date(w.measured_at), "d MMM yyyy", { locale: fr })}</span>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold">{w.weight} kg</span>
                    <button
                      onClick={() => delMut.mutate(w.id)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
