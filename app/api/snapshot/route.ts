import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/n8n";
import { SHEET_NAMES } from "@/lib/contracts";
import { fetchDirectWooOrders, mergeDirectWooOrders } from "@/lib/direct-woo-orders";
import type { CrmSnapshot, SheetRecord } from "@/lib/types";

export const dynamic = "force-dynamic";
const noCache = { "Cache-Control": "no-store" };

/** Read-only order overlay, independent of Google Sheets and WhatsApp send. */
async function addDirectOrders(snapshot: CrmSnapshot): Promise<CrmSnapshot> {
  try {
    const direct = await fetchDirectWooOrders();
    if (!direct.length) return snapshot;
    return {
      ...snapshot,
      sheets: {
        ...snapshot.sheets,
        [SHEET_NAMES.orders]: mergeDirectWooOrders(
          snapshot.sheets[SHEET_NAMES.orders] || [], direct,
        ),
      },
    };
  } catch (error) {
    console.warn("Direct Woo Neon order overlay failed:",
      error instanceof Error ? error.message : "unknown");
    return snapshot;
  }
}

export async function GET() {
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json(await addDirectOrders(snapshot), { headers: noCache });
  } catch (error) {
    // A Google Sheets 429 / n8n outage must not make all CRM orders disappear.
    // Serve an explicitly labelled read-only Neon mirror when one is available.
    try {
      const { getNeonRawSnapshot } = await import("@/lib/neon-snapshot");
      const raw = await getNeonRawSnapshot();
      const rows = (field: string): SheetRecord[] =>
        Array.isArray(raw[field]) ? raw[field] as SheetRecord[] : [];
      const fallback: CrmSnapshot = {
        source: "neon",
        syncedAt: String(raw.generatedAt || new Date().toISOString()),
        contractOk: false,
        contractWarnings: [
          "n8n CRM Gateway temporarily unavailable. Showing read-only Neon mirror; some messages may be delayed.",
        ],
        sheets: {
          [SHEET_NAMES.orders]: rows("orders"),
          [SHEET_NAMES.conversations]: rows("conversations"),
          [SHEET_NAMES.messages]: rows("messages"),
          [SHEET_NAMES.events]: rows("confirmationEvents"),
          [SHEET_NAMES.workflowHealth]: rows("workflowHealth"),
          [SHEET_NAMES.outbox]: rows("outbox"),
        },
      };
      return NextResponse.json(await addDirectOrders(fallback), { headers: noCache });
    } catch (mirrorError) {
      console.warn("Read-only Neon fallback unavailable:",
        mirrorError instanceof Error ? mirrorError.message : "unknown");
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "Unable to read CRM data from n8n" },
        { status: 502, headers: noCache },
      );
    }
  }
}
