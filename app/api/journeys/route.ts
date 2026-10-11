import { NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
export const dynamic = "force-dynamic";
export async function GET() {
  if (!process.env.DATABASE_URL) return NextResponse.json({ error: "DATABASE_URL missing" }, { status: 503 });
  try {
    const sql = neon(process.env.DATABASE_URL);
    const [stages, templates, jobs, campaigns, recommendations, dryRun, followupReview] = await Promise.all([
      sql`SELECT CONCAT('••••', RIGHT(s.phone_e164, 4)) AS phone_e164, s.stage, s.last_inbound_at, s.last_read_at, s.bot_paused, s.opted_out, s.updated_at, NULL::text AS display_name FROM crm_contact_stages s ORDER BY s.updated_at DESC LIMIT 200`,
      sql`SELECT id, code, name, language, stage, kind, content, is_enabled FROM crm_message_templates ORDER BY id`,
      sql`SELECT j.id, CONCAT('••••', RIGHT(j.phone_e164, 4)) AS phone_e164, j.trigger_type, j.stage_snapshot, j.due_at, j.status, t.name AS template_name FROM crm_followup_jobs j LEFT JOIN crm_message_templates t ON t.id=j.template_id ORDER BY j.due_at DESC LIMIT 100`,
      sql`SELECT campaign_id, campaign_name, impressions, clicks, link_clicks, messaging_conversations, spend, attributed_leads, attributed_orders FROM crm_campaign_performance ORDER BY attributed_leads DESC LIMIT 100`,
      sql`SELECT CONCAT('••••',RIGHT(phone_e164,4)) AS phone,stage,recommended_action,next_action_status,min_wait_hours,max_followups FROM crm_contact_recommendations ORDER BY next_action_status,stage LIMIT 200`,
      sql`SELECT stage,decision,reason,COUNT(*)::integer AS total FROM crm_dry_run_audits WHERE run_id='dryrun-20261011-v1' GROUP BY stage,decision,reason ORDER BY decision,stage`,
      sql`SELECT decision,reason,total FROM crm_followup_review_summary ORDER BY total DESC`
    ]);
    return NextResponse.json({ok:true,stages,templates,jobs,campaigns,recommendations,dryRun,followupReview,automation_enabled:false,meta_insights_connected:false},{headers:{"Cache-Control":"private, no-store"}});
  } catch { return NextResponse.json({error:"CRM journey data is currently unavailable"},{status:502}); }
}
