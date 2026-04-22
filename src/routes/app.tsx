import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/lib/auth-context";
import { canOpenOfflineApp } from "@/lib/offline";

export const Route = createFileRoute("/app")({
  component: AppGuard,
});

function AppGuard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user && !canOpenOfflineApp()) {
      navigate({ to: "/auth" });
    }
  }, [user, loading, navigate]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-sm text-muted-foreground">Chargement…</div>
      </div>
    );
  }

  if (!user && !canOpenOfflineApp()) return null;

  return (
    <AppLayout>
      <Outlet />
    </AppLayout>
  );
}
