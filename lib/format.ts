export function cleanDisplay(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value).trim();
  if (s === "51" || s === "#NAME?" || s === "#DIV/0!") return "";
  return s;
}

export function asNumber(value: unknown): number {
  const s = cleanDisplay(value).replace(/[^0-9.-]/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

export function normalizePhone(value: unknown): string {
  return String(value ?? "").replace(/\D/g, "");
}

export function dateValue(value: unknown): number {
  const s = cleanDisplay(value);
  if (!s) return 0;
  const d = Date.parse(s);
  return Number.isFinite(d) ? d : 0;
}

export function formatDate(value: unknown): string {
  const s = cleanDisplay(value);
  if (!s) return "—";
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  return new Intl.DateTimeFormat("fr-MA", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  }).format(d);
}

export function money(value: unknown, currency = "GTQ"): string {
  return new Intl.NumberFormat("es-GT", {
    style: "currency", currency, maximumFractionDigits: 2,
  }).format(asNumber(value));
}

export function textIncludes(haystack: unknown, needle: string): boolean {
  return cleanDisplay(haystack).toLowerCase().includes(needle.toLowerCase());
}
