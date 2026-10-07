import { NextResponse } from "next/server";
import { getN8nGatewayConfig, getSnapshot } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getN8nGatewayConfig();
  if (!config.configured) {
    return NextResponse.json({ ok: false, gateway: "not-configured", hasApiKey: config.hasApiKey }, { status: 503 });
  }
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json({ ok: true, gateway: "connected", source: snapshot.source, syncedAt: snapshot.syncedAt, hasApiKey: config.hasApiKey }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ ok: false, gateway: "error", error: error instanceof Error ? error.message : "Unknown gateway error", hasApiKey: config.hasApiKey }, { status: 502 });
  }
}
