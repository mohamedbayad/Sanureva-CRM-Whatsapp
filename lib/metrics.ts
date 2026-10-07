import type { CrmSnapshot, SheetRecord } from "@/lib/types";
import { SHEET_NAMES } from "@/lib/contracts";
import { asNumber, cleanDisplay, dateValue } from "@/lib/format";

export function computeMetrics(snapshot: CrmSnapshot) {
  const orders = snapshot.sheets[SHEET_NAMES.orders] || [];
  const conversations = snapshot.sheets[SHEET_NAMES.conversations] || [];
  const messages = snapshot.sheets[SHEET_NAMES.messages] || [];
  const events = snapshot.sheets[SHEET_NAMES.events] || [];
  const outbox = snapshot.sheets[SHEET_NAMES.outbox] || [];

  const confirmedOrders = orders.filter((o) => cleanDisplay(o["WhatsApp Status"]).toLowerCase() === "confirmed" || cleanDisplay(o["WooCommerce Status"]).toLowerCase() === "confirmed");
  const grossRevenue = orders.reduce((s, o) => s + asNumber(o["Final Total (MAD)"] || o["Order Value (MAD)"]), 0);
  const confirmedRevenue = confirmedOrders.reduce((s, o) => s + asNumber(o["Final Total (MAD)"] || o["Order Value (MAD)"]), 0);
  const reminders = events.filter((e) => cleanDisplay(e["Event Type"]).toLowerCase().includes("reminder")).length;
  const delivered = messages.filter((m) => ["delivered", "read"].includes(cleanDisplay(m["Delivery Status"]).toLowerCase())).length;
  const failed = messages.filter((m) => cleanDisplay(m["Delivery Status"]).toLowerCase() === "failed").length;
  const pendingOutbox = outbox.filter((o) => cleanDisplay(o.Action).toUpperCase() === "SEND").length;
  const responseTimes = orders.map((o) => asNumber(o["Response Time (Min)"])).filter((n) => n > 0);
  const avgResponse = responseTimes.length ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length : 0;

  return {
    orders: orders.length,
    confirmed: confirmedOrders.length,
    confirmationRate: orders.length ? confirmedOrders.length / orders.length : 0,
    grossRevenue,
    confirmedRevenue,
    avgOrder: orders.length ? grossRevenue / orders.length : 0,
    conversations: conversations.filter((c) => cleanDisplay(c["Conversation ID"])).length,
    messages: messages.length,
    delivered,
    failed,
    reminders,
    pendingOutbox,
    avgResponse,
  };
}

export function latestRows(rows: SheetRecord[], dateKey: string, limit = 8) {
  return [...rows].sort((a, b) => dateValue(b[dateKey]) - dateValue(a[dateKey])).slice(0, limit);
}
