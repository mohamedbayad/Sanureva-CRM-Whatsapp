import {NextRequest,NextResponse} from "next/server";
import {neon} from "@neondatabase/serverless";
import {timingSafeEqual} from "node:crypto";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function allowed(r:NextRequest){const k=process.env.CRM_TEMPLATE_ADMIN_KEY||"",v=r.headers.get("x-template-admin-key")||"";const a=Buffer.from(k),b=Buffer.from(v);return !!k&&!!v&&a.length===b.length&&timingSafeEqual(a,b)}
export async function POST(r:NextRequest){
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"Database not configured"},{status:503});
 try{const {phone}=await r.json();if(typeof phone!=="string"||!/^\d{8,15}$/.test(phone))return NextResponse.json({error:"Invalid phone"},{status:400});
 const sql=neon(process.env.DATABASE_URL);const rows=await sql`SELECT id,planned_at,timezone,notes,reminder_text,status FROM crm_purchase_reminders WHERE phone_e164=${phone} ORDER BY planned_at DESC LIMIT 10`;
 return NextResponse.json({ok:true,reminders:rows},{headers})}catch{return NextResponse.json({error:"Could not load reminders"},{status:502})}
}
export async function PUT(r:NextRequest){
 if(process.env.VERCEL_ENV==="preview")return NextResponse.json({error:"Read-only preview"},{status:403});
 if(!allowed(r))return NextResponse.json({error:"Admin key required"},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"Database not configured"},{status:503});
 try{const b=await r.json(),phone=String(b.phone||""),notes=String(b.notes||"").trim(),reminder=String(b.reminder_text||"").trim(),date=String(b.planned_at||"");
 if(!/^\d{8,15}$/.test(phone)||!reminder||reminder.length>1000||notes.length>500||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(Z|[+-]\d{2}:\d{2})$/.test(date))return NextResponse.json({error:"Invalid fields"},{status:400});
 const planned=new Date(date);if(!Number.isFinite(planned.getTime())||planned.getTime()<Date.now())return NextResponse.json({error:"Choose a future date"},{status:400});
 const sql=neon(process.env.DATABASE_URL);
 const rows=await sql`INSERT INTO crm_purchase_reminders(phone_e164,planned_at,notes,reminder_text) VALUES(${phone},${date}::timestamptz,${notes},${reminder}) RETURNING id,planned_at,status`;
 await sql`INSERT INTO crm_contact_stages(phone_e164,stage) VALUES(${phone},'scheduled_purchase') ON CONFLICT(phone_e164) DO UPDATE SET stage='scheduled_purchase',updated_at=now()`;
 return NextResponse.json({ok:true,reminder:rows[0]},{headers});
 }catch{return NextResponse.json({error:"Could not save reminder"},{status:500})}
}
