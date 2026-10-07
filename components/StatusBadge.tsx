import { cleanDisplay } from "@/lib/format";

export function StatusBadge({ value }: { value: unknown }) {
  const label = cleanDisplay(value) || "—";
  const v = label.toLowerCase();
  let tone = "neutral";
  if (["confirmed", "success", "read", "delivered", "accepted", "done", "ready for delivery"].some((x) => v.includes(x))) tone = "good";
  else if (["failed", "error", "cancelled", "canceled"].some((x) => v.includes(x))) tone = "bad";
  else if (["sent", "pending", "processing", "on-hold", "reminder"].some((x) => v.includes(x))) tone = "warn";
  return <span className={`status ${tone}`}>{label}</span>;
}
