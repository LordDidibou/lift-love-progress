import { useEffect, useState } from "react";
import { WifiOff } from "lucide-react";

export function OfflineIndicator() {
  const [online, setOnline] = useState(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const on = () => {
      setOnline(true);
      setVisible(false);
      if (timeout) clearTimeout(timeout);
    };
    const off = () => {
      setOnline(false);
      setVisible(true);
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(() => setVisible(false), 3500);
    };
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      if (timeout) clearTimeout(timeout);
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (online || !visible) return null;
  return (
    <button
      type="button"
      onClick={() => setVisible(false)}
      className="fixed left-1/2 top-2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full border border-border bg-card/95 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-card"
    >
      <WifiOff className="h-3.5 w-3.5 text-accent" />
      Hors ligne
    </button>
  );
}

export function registerServiceWorker() {
  if (typeof window === "undefined") return;
  // Ne pas enregistrer dans iframe (preview Lovable) ni sur les domaines preview
  const inIframe = (() => {
    try {
      return window.self !== window.top;
    } catch {
      return true;
    }
  })();
  const isPreview =
    window.location.hostname.includes("id-preview--") ||
    window.location.hostname.includes("lovableproject.com") ||
    window.location.hostname === "localhost";

  if (inIframe || isPreview) {
    // Désinscrire d'éventuels SW existants en preview
    navigator.serviceWorker?.getRegistrations().then((rs) => rs.forEach((r) => r.unregister()));
    return;
  }

  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("/sw.js").catch((e) => console.warn("SW failed", e));
    });
  }
}
