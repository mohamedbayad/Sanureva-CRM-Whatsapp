import { NextRequest, NextResponse } from "next/server";
import { queueWhatsAppMessage } from "@/lib/n8n";
import type { OutboxPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.VERCEL_ENV === "preview" && process.env.CRM_READ_SOURCE === "neon_shadow") {
    return NextResponse.json({ ok: false, error: "WhatsApp sending is disabled in read-only Neon Preview" }, { status: 403 });
  }
  try {
    const body = (await request.json()) as OutboxPayload;
    const result = await queueWhatsAppMessage(body);
    return NextResponse.json({ ok: true, ...result }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "Unable to queue WhatsApp message through n8n" },
      { status: 400 }
    );
  }
}
