import { createFileRoute, redirect, useNavigate } from "@tanstack/react-router";
import { Dumbbell, Eye, EyeOff } from "lucide-react";
import { useState, useEffect, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { canOpenOfflineApp, getFriendlyError, isOfflineClient } from "@/lib/offline";

export const Route = createFileRoute("/auth")({
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session || canOpenOfflineApp()) throw redirect({ to: "/app" });
    } catch {
      if (canOpenOfflineApp()) throw redirect({ to: "/app" });
    }
  },
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [remember, setRemember] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("forge:remembered_email") : null;
    if (saved) setEmail(saved);
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (isOfflineClient()) {
      if (mode === "signin" && canOpenOfflineApp()) {
        toast.info("Mode hors ligne : ouverture de l'app avec les données déjà présentes");
        navigate({ to: "/app" });
        return;
      }
      toast.error(
        mode === "forgot"
          ? "Internet est nécessaire pour envoyer un lien de réinitialisation"
          : mode === "signup"
            ? "Internet est nécessaire pour créer un compte"
            : "Connecte-toi une première fois avec Internet pour ouvrir l'app hors ligne",
      );
      return;
    }
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/reset-password`,
        });
        if (error) throw error;
        toast.success("Email de réinitialisation envoyé !");
        setMode("signin");
      } else if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/app` },
        });
        if (error) throw error;
        if (remember) localStorage.setItem("forge:remembered_email", email);
        else localStorage.removeItem("forge:remembered_email");
        toast.success("Compte créé !");
        navigate({ to: "/app" });
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (remember) localStorage.setItem("forge:remembered_email", email);
        else localStorage.removeItem("forge:remembered_email");
        navigate({ to: "/app" });
      }
    } catch (err) {
      toast.error(
        getFriendlyError(err, "Action impossible hors ligne", "Erreur d'authentification"),
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4">
      <div className="absolute inset-0 bg-gradient-hero" />
      <div className="relative z-10 w-full max-w-md">
        <div className="mb-8 flex flex-col items-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-gradient-primary shadow-glow">
            <Dumbbell className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-4 font-display text-3xl font-bold">FORGE</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {mode === "signin" ? "Reprends ta séance" : mode === "signup" ? "Lance-toi maintenant" : "Réinitialise ton mot de passe"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          {mode !== "forgot" && (
            <div className="mb-6 grid grid-cols-2 gap-1 rounded-md bg-secondary p-1">
              {(["signin", "signup"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded px-3 py-2 text-sm font-semibold transition-colors ${
                    mode === m ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
                  }`}
                >
                  {m === "signin" ? "Connexion" : "Inscription"}
                </button>
              ))}
            </div>
          )}

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Email
              </label>
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    Mot de passe
                  </label>
                  {mode === "signin" && (
                    <button
                      type="button"
                      onClick={() => setMode("forgot")}
                      className="text-xs font-semibold text-primary hover:underline"
                    >
                      Oublié ?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={6}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2.5 pr-10 text-sm focus:border-primary focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted-foreground hover:text-foreground"
                    aria-label={showPassword ? "Masquer" : "Afficher"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            )}

            {mode !== "forgot" && (
              <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRemember(e.target.checked)}
                  className="h-4 w-4 rounded border-input accent-primary"
                />
                Se souvenir de mon email
              </label>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-md bg-gradient-primary py-3 text-sm font-bold text-primary-foreground shadow-glow transition-transform hover:scale-[1.01] disabled:opacity-50"
            >
              {loading ? "..." : mode === "signin" ? "Se connecter" : mode === "signup" ? "Créer mon compte" : "Envoyer le lien"}
            </button>

            {mode === "forgot" && (
              <button
                type="button"
                onClick={() => setMode("signin")}
                className="w-full text-center text-xs font-semibold text-muted-foreground hover:text-foreground"
              >
                ← Retour à la connexion
              </button>
            )}
          </form>
        </div>
      </div>
    </div>
  );
}
