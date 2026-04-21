import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { Dumbbell } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    // When the user clicks the recovery link, Supabase sets a session via the URL hash
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      toast.error("Les mots de passe ne correspondent pas");
      return;
    }
    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Mot de passe mis à jour !");
      navigate({ to: "/app" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erreur");
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
          <h1 className="mt-4 font-display text-3xl font-bold">Nouveau mot de passe</h1>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-card">
          {!ready ? (
            <div className="text-center text-sm text-muted-foreground">
              <p>Lien invalide ou expiré.</p>
              <Link to="/auth" className="mt-3 inline-block font-semibold text-primary hover:underline">
                Retour à la connexion
              </Link>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Nouveau mot de passe
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Confirmer
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className="w-full rounded-md border border-input bg-background px-3 py-2.5 text-sm focus:border-primary focus:outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full rounded-md bg-gradient-primary py-3 text-sm font-bold text-primary-foreground shadow-glow disabled:opacity-50"
              >
                {loading ? "..." : "Mettre à jour"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
