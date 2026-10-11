import {NextRequest,NextResponse} from "next/server";
import {neon} from "@neondatabase/serverless";
import {timingSafeEqual} from "node:crypto";
export const dynamic="force-dynamic";
const noStore={"Cache-Control":"private, no-store"};
function isAdmin(r:NextRequest){const key=process.env.CRM_TEMPLATE_ADMIN_KEY||"";const provided=r.headers.get("x-template-admin-key")||"";const a=Buffer.from(key),b=Buffer.from(provided);return !!key&&!!provided&&a.length===b.length&&timingSafeEqual(a,b)}
export async function POST(r:NextRequest){
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"Database not configured"},{status:503});
 try{
  const body=await r.json(),phone=String(body.phone||"");
  if(!/^\d{8,15}$/.test(phone))return NextResponse.json({error:"Invalid phone"},{status:400});
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql`SELECT p.job_id,p.topic,p.channel,p.proposed_text,p.approval_status,p.rationale,rv.decision AS review_decision,j.stage_snapshot FROM crm_followup_proposals p JOIN crm_followup_jobs j ON j.id=p.job_id JOIN crm_followup_reviews rv ON rv.job_id=j.id WHERE j.phone_e164=${phone} AND j.status='draft' ORDER BY j.created_at DESC LIMIT 5`;
  return NextResponse.json({ok:true,drafts:rows},{headers:noStore});
 }catch{return NextResponse.json({error:"Unable to load drafts"},{status:502})}
}
export async function PATCH(r:NextRequest){
 if(process.env.VERCEL_ENV==="preview"||process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY==="1")return NextResponse.json({error:"Preview is read-only"},{status:403});
 if(!isAdmin(r))return NextResponse.json({error:"Admin key missing or incorrect"},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"Database not configured"},{status:503});
 try{
  const body=await r.json(),jobId=Number(body.job_id),content=String(body.proposed_text||"").trim();
  if(!Number.isSafeInteger(jobId)||jobId<1||!content||content.length>2500)return NextResponse.json({error:"Draft must contain 1–2500 characters"},{status:400});
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql`UPDATE crm_followup_proposals p SET proposed_text=${content},updated_at=now(),approval_status='needs_review' FROM crm_followup_jobs j WHERE p.job_id=${jobId} AND j.id=p.job_id AND j.status='draft' RETURNING p.job_id,p.proposed_text,p.approval_status`;
  if(!rows.length)return NextResponse.json({error:"Draft not found or no longer editable"},{status:404});
  return NextResponse.json({ok:true,draft:rows[0]},{headers:noStore});
 }catch{return NextResponse.json({error:"Could not save draft"},{status:500})}
}
