import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { readCachedUser, writeCachedUser, isOfflineClient, type CachedUser } from "@/lib/offline";

type AuthContextValue = {
  user: CachedUser | null;
  session: Session | null;
  loading: boolean;
  isOffline: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineUser, setOfflineUser] = useState<CachedUser | null>(null);
  const [isOffline, setIsOffline] = useState(isOfflineClient());

  useEffect(() => {
    setOfflineUser(readCachedUser());

    const onOnline = () => setIsOffline(false);
    const onOffline = () => {
      setIsOffline(true);
      setOfflineUser(readCachedUser());
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const syncSession = (s: Session | null) => {
      setSession(s);
      if (s?.user) {
        const nextUser = { id: s.user.id, email: s.user.email ?? null };
        setOfflineUser(nextUser);
        writeCachedUser(nextUser);
      }
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        writeCachedUser(null);
        setOfflineUser(null);
      }
      syncSession(s);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        syncSession(data.session);
        if (!data.session) setOfflineUser(readCachedUser());
      })
      .catch(() => {
        setOfflineUser(readCachedUser());
        setLoading(false);
      });

    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      sub.subscription.unsubscribe();
    };
  }, []);

  const user = session?.user
    ? { id: session.user.id, email: session.user.email ?? null }
    : isOffline
      ? offlineUser
      : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        isOffline,
        signOut: async () => {
          writeCachedUser(null);
          setOfflineUser(null);
          setSession(null);
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
