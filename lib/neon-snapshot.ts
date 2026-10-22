import { neon } from "@neondatabase/serverless";
import type { SheetRecord } from "@/lib/types";
import { toCrmOrder } from "@/lib/direct-woo-orders";

// Read-only mirror. Never change the CRM's write path or orders from this module.
const toRecords = (rows: Array<Record<string, unknown>>): SheetRecord[] =>
  rows.map((row) => {
    const source_record = row.source_record;
    if (!source_record || typeof source_record !== "object" || Array.isArray(source_record)) {
      throw new Error("Neon snapshot contains invalid source_record data");
    }
    return source_record as SheetRecord;
  });

/** Preserve Sheets-origin rows, while materializing direct Woo rows from canonical fields. */
const orderToRecords = (rows: Array<Record<string, unknown>>): SheetRecord[] =>
  rows.map((row) => {
    const raw = row.source_record;
    const data = raw && typeof raw === "object" && !Array.isArray(raw)
      ? raw as Record<string, unknown> : null;
    return data?.woocommerce_direct === true ? toCrmOrder(row) : toRecords([row])[0];
  });

export async function getNeonRawSnapshot(): Promise<Record<string, unknown>> {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) throw new Error("Neon DATABASE_URL is not configured");

  const sql = neon(url);
  const [orders, conversations, messages, events, health, outbox, stats] = await Promise.all([
    sql`SELECT order_id, customer_phone, customer_name, customer_city, created_at_source, grand_total, woocommerce_status, whatsapp_status, delivery_status, reminders_sent, source_record FROM public.orders ORDER BY created_at_source NULLS LAST, order_id`,
    sql`SELECT source_record FROM public.conversations ORDER BY started_at NULLS LAST, conversation_id`,
    sql`SELECT m.source_record FROM public.messages m WHERE NOT (m.conversation_id IS NULL AND (m.customer_phone IS NULL OR m.customer_phone='UNKNOWN' OR btrim(m.customer_phone)='') AND NULLIF(btrim(COALESCE(m.message_text,'')),'') IS NULL AND NULLIF(btrim(COALESCE(m.caption,'')),'') IS NULL AND NULLIF(btrim(COALESCE(m.source_record->>'Message Content Snippet','')),'') IS NULL AND NULLIF(btrim(COALESCE(m.source_record->>'Message Type','')),'') IS NULL AND NULLIF(btrim(COALESCE(m.source_record->>'Direction','')),'') IS NULL AND NULLIF(btrim(COALESCE(m.source_record->>'Message ID','')),'') IS NULL AND NULLIF(btrim(COALESCE(m.whatsapp_wamid,'')),'') IS NOT NULL AND LOWER(btrim(m.delivery_status)) IN ('read','delivered','failed','sent')) ORDER BY m.occurred_at, m.id`,
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
    orders: orderToRecords(orders),
    conversations: toRecords(conversations),
    messages: toRecords(messages),
    confirmationEvents: toRecords(events),
    workflowHealth: toRecords(health),
    outbox: toRecords(outbox),
  };
}

/**
 * Manual template retries can be accepted by WhatsApp without passing through
 * the Sheets writer. Read their actual WAMIDs and delivery statuses from Neon
 * so that the inbox can show the attempts without sending anything again.
 */
export async function getNeonManualRetryMessages(): Promise<SheetRecord[]> {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) return [];
  const sql = neon(url);
  const rows = await sql`
    SELECT m.legacy_message_id, m.whatsapp_wamid, m.conversation_id,
           m.customer_phone, m.customer_name, m.order_id, m.message_text,
           m.occurred_at,
           COALESCE(last_status.delivery_status, m.delivery_status) AS current_status
    FROM public.messages m
    LEFT JOIN LATERAL (
      SELECT d.delivery_status
      FROM public.whatsapp_delivery_events d
      WHERE d.whatsapp_wamid = m.whatsapp_wamid
      ORDER BY d.status_at DESC, d.received_at DESC
      LIMIT 1
    ) last_status ON true
    WHERE m.source_record ->> 'source' = 'n8n_one_time_template_retry'
      AND m.direction = 'outbound'
      AND NULLIF(BTRIM(m.whatsapp_wamid), '') IS NOT NULL
      AND NULLIF(BTRIM(m.message_text), '') IS NOT NULL
    ORDER BY m.occurred_at, m.id
  `;

  return rows.flatMap((row) => {
    const phone = String(row.customer_phone || "").replace(/\D/g, "");
    const conversationId = String(row.conversation_id || ("WA-" + phone));
    const wamid = String(row.whatsapp_wamid || "").trim();
    if (!/^\d{8,15}$/.test(phone) || conversationId !== "WA-" + phone || !wamid.startsWith("wamid.")) {
      return [];
    }
    const record: SheetRecord = {
      "Message ID": String(row.legacy_message_id || ("RETRY-" + wamid)),
      "Conversation ID": conversationId,
      "Order ID": String(row.order_id || ""),
      "Timestamp": new Date(String(row.occurred_at)).toISOString(),
      "Direction": "Outbound (Bot)",
      "Message Type": "Template (HSM)",
      "Message Content Snippet": String(row.message_text || ""),
      // Preserve the real WhatsApp callback status. "sent" is not "delivered".
      "Delivery Status": String(row.current_status || "unknown").toLowerCase(),
      "WhatsApp WAMID": wamid,
      "Unit Cost (MAD)": null,
      "Customer Phone": phone,
      "Customer Name": String(row.customer_name || ""),
    };
    return [record];
  });
}


/** Latest authoritative WhatsApp status callback for every logged message WAMID. */
export async function getNeonLatestMessageStatuses(): Promise<Array<{ wamid: string; status: string }>> {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) return [];
  const sql = neon(url);
  const rows = await sql`
    SELECT DISTINCT ON (whatsapp_wamid)
           whatsapp_wamid, delivery_status
    FROM public.whatsapp_delivery_events
    WHERE NULLIF(BTRIM(whatsapp_wamid), '') IS NOT NULL
    ORDER BY whatsapp_wamid, status_at DESC, received_at DESC
  `;
  return rows.map((row) => ({
    wamid: String(row.whatsapp_wamid || ""),
    status: String(row.delivery_status || "").toLowerCase(),
  }));
}
