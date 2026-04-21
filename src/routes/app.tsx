import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/AppLayout";
import { canOpenOfflineApp } from "@/lib/offline";

export const Route = createFileRoute("/app")({
  beforeLoad: async () => {
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session && !canOpenOfflineApp()) throw redirect({ to: "/auth" });
    } catch {
      if (!canOpenOfflineApp()) throw redirect({ to: "/auth" });
    }
  },
  component: () => (
    <AppLayout>
      <Outlet />
    </AppLayout>
  ),
});
