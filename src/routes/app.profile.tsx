import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { Scale, Plus, Trash2, KeyRound, Eye, EyeOff, User, Check, Camera, Loader2 } from "lucide-react";
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
import { DecimalInput } from "@/components/DecimalInput";
import { SubscriptionCard } from "@/components/SubscriptionCard";

export const Route = createFileRoute("/app/profile")({
  component: ProfilePage,
});

function ProfilePage() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const [weight, setWeight] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [pwLoading, setPwLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [originalName, setOriginalName] = useState("");

  const { data: profile } = useQuery({
    queryKey: ["profile", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  const uploadAvatar = async (file: File) => {
    if (!user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Image trop lourde (max 5 Mo)");
      return;
    }
    setAvatarUploading(true);
    try {
      const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, cacheControl: "3600" });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("avatars").getPublicUrl(path);
      const { error: updErr } = await supabase
        .from("profiles")
        .update({ avatar_url: pub.publicUrl })
        .eq("id", user.id);
      if (updErr) throw updErr;
      toast.success("Photo mise à jour");
      qc.invalidateQueries({ queryKey: ["profile"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur upload");
    } finally {
      setAvatarUploading(false);
    }
  };

  useEffect(() => {
    if (profile?.display_name !== undefined && profile?.display_name !== null) {
      setDisplayName(profile.display_name);
      setOriginalName(profile.display_name);
    }
  }, [profile?.display_name]);

  const renameMut = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Non connecté");
      const trimmed = displayName.trim();
      if (!trimmed) throw new Error("Nom vide");
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: trimmed })
        .eq("id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Nom mis à jour");
      setOriginalName(displayName.trim());
      qc.invalidateQueries({ queryKey: ["profile"] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Erreur"),
  });


  const changePassword = async () => {
    if (newPassword.length < 6) {
      toast.error("Mot de passe trop court (6 min)");
      return;
    }
    if (newPassword !== confirmPassword) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setPwLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      toast.success("Mot de passe mis à jour");
      setNewPassword("");
      setConfirmPassword("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur");
    } finally {
      setPwLoading(false);
    }
  };

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
      const w = Number(String(weight).replace(",", "."));
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
          <User className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Identité</h2>
        </div>
        <div className="mb-5 flex items-center gap-4">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={avatarUploading}
            className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full border-2 border-border bg-secondary transition-colors hover:border-primary"
            aria-label="Changer la photo"
          >
            {profile?.avatar_url ? (
              <img src={profile.avatar_url} alt="Avatar" className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                <User className="h-8 w-8" />
              </div>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/60 opacity-0 transition-opacity group-hover:opacity-100">
              {avatarUploading ? (
                <Loader2 className="h-5 w-5 animate-spin text-white" />
              ) : (
                <Camera className="h-5 w-5 text-white" />
              )}
            </div>
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">Photo de profil</p>
            <p className="text-xs text-muted-foreground">Clique pour {profile?.avatar_url ? "changer" : "ajouter"} (max 5 Mo)</p>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadAvatar(f);
                e.target.value = "";
              }}
            />
          </div>
        </div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Nom affiché
        </label>
        <div className="flex gap-2">
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Ton nom"
            className="min-w-0 flex-1 rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
          />
          <button
            onClick={() => renameMut.mutate()}
            disabled={
              renameMut.isPending ||
              !displayName.trim() ||
              displayName.trim() === originalName
            }
            className="flex shrink-0 items-center gap-1.5 rounded-md bg-gradient-primary px-3 text-sm font-bold text-primary-foreground disabled:opacity-50 sm:px-4"
          >
            <Check className="h-4 w-4" />
            <span className="hidden sm:inline">Enregistrer</span>
          </button>
        </div>
      </section>

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
          <DecimalInput
            value={weight}
            onValueChange={(v) => setWeight(v ? String(v) : "")}
            placeholder="Ton poids (ex: 72,5)"
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

      <section className="rounded-xl border border-border bg-card p-5 shadow-card">
        <div className="mb-4 flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">Changer mon mot de passe</h2>
        </div>
        <div className="space-y-3">
          <div className="relative">
            <input
              type={showNewPassword ? "text" : "password"}
              placeholder="Nouveau mot de passe"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 pr-10 text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowNewPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label={showNewPassword ? "Masquer" : "Afficher"}
            >
              {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              placeholder="Confirmer"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              minLength={6}
              className="w-full rounded-md border border-input bg-background px-3 py-2.5 pr-10 text-sm focus:border-primary focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
              aria-label={showConfirmPassword ? "Masquer" : "Afficher"}
            >
              {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button
            onClick={changePassword}
            disabled={pwLoading || !newPassword || !confirmPassword}
            className="w-full rounded-md bg-gradient-primary py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {pwLoading ? "..." : "Mettre à jour"}
          </button>
        </div>
      </section>
    </div>
  );
}
