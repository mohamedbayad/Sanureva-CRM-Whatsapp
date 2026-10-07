import { NextResponse } from "next/server";
import { getSnapshot } from "@/lib/n8n";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getSnapshot();
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to read CRM data from n8n" },
      { status: 502 }
    );
  }
}
