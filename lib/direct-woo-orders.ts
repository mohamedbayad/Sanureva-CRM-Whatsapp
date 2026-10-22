import { neon } from "@neondatabase/serverless";
import type { SheetRecord } from "@/lib/types";

/**
 * Direct Woo orders are written even when WhatsApp or Sheets fails.
 * Translate Neon columns to the legacy Orders view without inventing
 * WhatsApp delivery or confirmation outcomes.
 */
export function toCrmOrder(row: Record<string, unknown>): SheetRecord {
  const raw = row.source_record;
  const source = raw && typeof raw === "object" && !Array.isArray(raw)
    ? raw as Record<string, unknown> : {};
  const read = (key: string) => source[key] == null ? "" : String(source[key]);
  const txt = (value: unknown, fallback = "") => value == null ? fallback : String(value);
  const total = txt(row.grand_total, read("Final Total (MAD)"));
  return {
    "Order ID": txt(row.order_id),
    "Date & Time": txt(row.created_at_source, read("Date & Time")),
    "Customer Name": txt(row.customer_name, read("Customer Name")),
    "Phone Number": txt(row.customer_phone, read("Phone Number")),
    "City": txt(row.customer_city, read("City")),
    "Items / Products": txt(source.product_summary, read("Items / Products")),
    "Order Value (MAD)": total,
    "Final Total (MAD)": total,
    "WooCommerce Status": txt(row.woocommerce_status, read("WooCommerce Status")),
    "WhatsApp Status": txt(row.whatsapp_status, read("WhatsApp Status")),
    "Delivery Status": txt(row.delivery_status, read("Delivery Status")),
    "Confirmation Sent": read("Confirmation Sent"),
    "Confirmation Received": read("Confirmation Received"),
    "Reminders Sent": typeof row.reminders_sent === "number" ? row.reminders_sent : 0,
  };
}

/** Read-only, safely scoped to the latest direct Woo order data. */
export async function fetchDirectWooOrders(): Promise<SheetRecord[]> {
  const url = (process.env.DATABASE_URL || "").trim();
  if (!url) return [];
  const sql = neon(url);
  const rows = await sql`
    SELECT order_id, customer_phone, customer_name, customer_city,
           created_at_source, grand_total, woocommerce_status,
           whatsapp_status, delivery_status, reminders_sent, source_record
    FROM public.orders
    WHERE source_record->>'woocommerce_direct' = 'true'
    ORDER BY created_at_source DESC NULLS LAST, order_id DESC
    LIMIT 2000
  `;
  return rows.map(toCrmOrder);
}

/** Merge by exact Woo order ID; keep known customer confirmation states. */
export function mergeDirectWooOrders(existing: SheetRecord[], direct: SheetRecord[]): SheetRecord[] {
  const byId = new Map<string, SheetRecord>();
  for (const row of existing) {
    const id = String(row["Order ID"] ?? "").trim();
    if (id) byId.set(id, { ...row });
  }
  for (const row of direct) {
    const id = String(row["Order ID"] ?? "").trim();
    if (!id) continue;
    const prior = byId.get(id);
    if (!prior) {
      byId.set(id, row);
      continue;
    }
    const merged: SheetRecord = { ...prior };
    for (const key of ["Customer Name", "Phone Number", "City", "Items / Products",
                       "Order Value (MAD)", "Final Total (MAD)", "WooCommerce Status"]) {
      const value = row[key];
      if (value !== undefined && value !== null && String(value).trim() !== "") merged[key] = value;
    }
    // Preserve the original Woo order creation timestamp and tracked status.
    for (const key of ["WhatsApp Status", "Delivery Status",
                       "Confirmation Sent", "Confirmation Received", "Reminders Sent"]) {
      const current = prior[key];
      if (current === undefined || current === null || current === "") merged[key] = row[key] ?? "";
    }
    byId.set(id, merged);
  }
  return [...byId.values()];
}
