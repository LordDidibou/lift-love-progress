import { format } from "date-fns";

const DATE_RX = /\s*[–\-]\s*\d{2}\/\d{2}\/\d{4}\s*$/;

/** Removes a trailing " – dd/MM/yyyy" (or "- ...") from a workout name. */
export function stripTrailingDate(name: string): string {
  return name.replace(DATE_RX, "").trim();
}

/**
 * Enforces the canonical naming convention:
 *   "<Nom> – dd/MM/yyyy"
 * Strips any pre-existing trailing date so it never doubles.
 */
export function withDateSuffix(name: string, date: Date): string {
  const base = stripTrailingDate((name || "").trim()) || "Séance";
  return `${base} – ${format(date, "dd/MM/yyyy")}`;
}
