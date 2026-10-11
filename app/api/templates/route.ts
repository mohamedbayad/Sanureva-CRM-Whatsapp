import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";
export const dynamic = "force-dynamic";
function authorized(r:NextRequest) {
 const expected=process.env.CRM_TEMPLATE_ADMIN_KEY||"";
 const supplied=r.headers.get("x-template-admin-key")||"";
 if(!expected||!supplied)return false;
 const a=Buffer.from(expected),b=Buffer.from(supplied);
 return a.length===b.length&&timingSafeEqual(a,b);
}
export async function PATCH(request:NextRequest){
 if(process.env.VERCEL_ENV==="preview"||process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY==="1")return NextResponse.json({error:"Preview is read-only"},{status:403});
 if(!authorized(request))return NextResponse.json({error:"Admin key missing or invalid; configure CRM_TEMPLATE_ADMIN_KEY in Vercel"},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"DATABASE_URL is missing"},{status:503});
 try {
  const body=await request.json();
  const id=Number(body.id),name=String(body.name||"").trim(),content=String(body.content||"").trim(),language=String(body.language||"es-GT").trim(),stage=String(body.stage||"").trim(),kind=String(body.kind||"text"),enabled=body.is_enabled===true;
  if(!Number.isSafeInteger(id)||id<1||!name||name.length>120||!content||content.length>4000||!["text","audio","approved_template"].includes(kind)||language.length>20||stage.length>60)return NextResponse.json({error:"Invalid template fields"},{status:400});
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql`UPDATE crm_message_templates SET name=${name},content=${content},language=${language},stage=${stage||null},is_enabled=${enabled},updated_at=NOW() WHERE id=${id} RETURNING id,name,content,language,stage,kind,is_enabled`;
  if(!rows.length)return NextResponse.json({error:"Template not found"},{status:404});
  return NextResponse.json({ok:true,template:rows[0]},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Could not save template"},{status:500});}
}
