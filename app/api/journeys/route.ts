import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 503 });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const [stages, templates, jobs, campaigns] = await Promise.all([
      sql`SELECT CONCAT('••••', RIGHT(s.phone_e164, 4)) AS phone_e164, s.stage, s.last_inbound_at, s.last_read_at, s.bot_paused, s.opted_out, s.updated_at, NULL::text AS display_name FROM crm_contact_stages s ORDER BY s.updated_at DESC LIMIT 200`,
      sql`SELECT id, code, name, language, stage, kind, content, is_enabled FROM crm_message_templates ORDER BY id`,
      sql`SELECT j.id, CONCAT('••••', RIGHT(j.phone_e164, 4)) AS phone_e164, j.trigger_type, j.stage_snapshot, j.due_at, j.status, t.name AS template_name FROM crm_followup_jobs j LEFT JOIN crm_message_templates t ON t.id=j.template_id ORDER BY j.due_at DESC LIMIT 100`,
      sql`SELECT campaign_id, campaign_name, impressions, clicks, link_clicks, messaging_conversations, spend, attributed_leads, attributed_orders FROM crm_campaign_performance ORDER BY attributed_leads DESC LIMIT 100`
    ]);
    return NextResponse.json({ok:true,stages,templates,jobs,campaigns,automation_enabled:false,meta_insights_connected:false},{headers:{"Cache-Control":"private, no-store"}});
  } catch { return NextResponse.json({error:"CRM journey data is currently unavailable"},{status:502}); }
}
