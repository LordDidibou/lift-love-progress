import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

type AuthUser = Pick<User, "id" | "email">;

type AuthContextValue = {
  user: AuthUser | null;
  session: Session | null;
  loading: boolean;
  isOffline: boolean;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const LAST_USER_KEY = "forge:last-user";

function readLastUser(): AuthUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; email?: unknown };
    if (typeof parsed.id !== "string") return null;
    return { id: parsed.id, email: typeof parsed.email === "string" ? parsed.email : null };
  } catch {
    return null;
  }
}

function writeLastUser(user: AuthUser | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    window.localStorage.removeItem(LAST_USER_KEY);
    return;
  }
  window.localStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [offlineUser, setOfflineUser] = useState<AuthUser | null>(null);
  const [isOffline, setIsOffline] = useState(typeof navigator !== "undefined" ? !navigator.onLine : false);

  useEffect(() => {
    setOfflineUser(readLastUser());

    const onOnline = () => setIsOffline(false);
    const onOffline = () => {
      setIsOffline(true);
      setOfflineUser(readLastUser());
    };

    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);

    const syncSession = (s: Session | null) => {
      setSession(s);
      if (s?.user) {
        const nextUser = { id: s.user.id, email: s.user.email ?? null };
        setOfflineUser(nextUser);
        writeLastUser(nextUser);
      }
      setLoading(false);
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT") {
        writeLastUser(null);
        setOfflineUser(null);
      }
      syncSession(s);
    });

    supabase.auth
      .getSession()
      .then(({ data }) => {
        syncSession(data.session);
        if (!data.session) setOfflineUser(readLastUser());
      })
      .catch(() => {
        setOfflineUser(readLastUser());
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
          writeLastUser(null);
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
