/**
 * Compact number formatting for large values, FR locale.
 * 1234       -> "1 234"
 * 12 345     -> "12 345"
 * 99 999     -> "99 999"
 * 100 000    -> "100k"
 * 1 234 567  -> "1.2M"
 */
export function formatCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs < 100_000) return Math.round(n).toLocaleString("fr-FR");
  if (abs < 1_000_000) return `${Math.round(n / 1000)}k`;
  if (abs < 10_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")}M`;
  return `${Math.round(n / 1_000_000)}M`;
}
