import { neon } from "@neondatabase/serverless";
import type { SheetRecord } from "@/lib/types";

// Read-only mirror. Never change the CRM's write path or orders from this module.
const toRecords = (rows: Array<{ source_record: unknown }>): SheetRecord[] =>
  rows.map(({ source_record }) => {
    if (!source_record || typeof source_record !== "object" || Array.isArray(source_record)) {
      throw new Error("Neon snapshot contains invalid source_record data");
    }
    return source_record as SheetRecord;
  });

export async function getNeonRawSnapshot(): Promise<Record<string, unknown>> {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("Neon DATABASE_URL is not configured");

  const sql = neon(url);
  const [orders, conversations, messages, events, health, outbox, stats] = await Promise.all([
    sql`SELECT source_record FROM public.orders ORDER BY created_at_source NULLS LAST, order_id`,
    sql`SELECT source_record FROM public.conversations ORDER BY started_at NULLS LAST, conversation_id`,
    sql`SELECT source_record FROM public.messages ORDER BY occurred_at, id`,
    sql`SELECT source_record FROM public.confirmation_events ORDER BY occurred_at NULLS LAST, event_id`,
    sql`SELECT source_record FROM public.workflow_health ORDER BY occurred_at NULLS LAST, id`,
    sql`SELECT source_record FROM public.whatsapp_outbox ORDER BY scheduled_at, request_id`,
    sql`SELECT (SELECT count(*)::integer FROM public.orders) AS orders,
               (SELECT count(*)::integer FROM public.conversations) AS conversations,
               (SELECT count(*)::integer FROM public.messages) AS messages`,
  ]);

  const counts = stats[0] as { orders: number; conversations: number; messages: number } | undefined;
  // If replication is missing critical CRM records, fail safely to the established Sheets gateway.
  if (!counts || counts.orders === 0 || counts.conversations === 0 || counts.messages === 0) {
    throw new Error("Neon snapshot is incomplete; falling back to n8n");
  }
  return {
    ok: true,
    source: "n8n", // Preserve the existing CrmSnapshot contract for the CRM UI.
    generatedAt: new Date().toISOString(),
    orders: toRecords(orders),
    conversations: toRecords(conversations),
    messages: toRecords(messages),
    confirmationEvents: toRecords(events),
    workflowHealth: toRecords(health),
    outbox: toRecords(outbox),
  };
}
