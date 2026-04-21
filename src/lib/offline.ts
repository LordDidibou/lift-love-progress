export type CachedUser = {
  id: string;
  email: string | null;
};

export const LAST_USER_KEY = "forge:last-user";

export function readCachedUser(): CachedUser | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(LAST_USER_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { id?: unknown; email?: unknown };
    if (typeof parsed.id !== "string") return null;
    return {
      id: parsed.id,
      email: typeof parsed.email === "string" ? parsed.email : null,
    };
  } catch {
    return null;
  }
}

export function writeCachedUser(user: CachedUser | null) {
  if (typeof window === "undefined") return;
  if (!user) {
    window.localStorage.removeItem(LAST_USER_KEY);
    return;
  }
  window.localStorage.setItem(LAST_USER_KEY, JSON.stringify(user));
}

export function isOfflineClient() {
  return typeof navigator !== "undefined" && !navigator.onLine;
}

export function canOpenOfflineApp() {
  return isOfflineClient() && !!readCachedUser();
}

export function isLikelyOfflineError(error: unknown) {
  if (!isOfflineClient()) return false;
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return ["failed to fetch", "load failed", "networkerror", "fetch", "offline"].some((part) =>
    message.includes(part),
  );
}

export function getFriendlyError(error: unknown, offlineMessage: string, fallback = "Erreur") {
  if (isLikelyOfflineError(error)) return offlineMessage;
  return error instanceof Error && error.message ? error.message : fallback;
}