import {NextRequest,NextResponse} from "next/server";
import {neon} from "@neondatabase/serverless";
import {timingSafeEqual} from "node:crypto";
export const dynamic="force-dynamic";
function validAdmin(req:NextRequest){const expected=process.env.CRM_TEMPLATE_ADMIN_KEY||"",actual=req.headers.get("x-template-admin-key")||"";const a=Buffer.from(expected),b=Buffer.from(actual);return !!expected&&!!actual&&a.length===b.length&&timingSafeEqual(a,b)}
export async function POST(req:NextRequest){
 if(process.env.VERCEL_ENV==="preview"||process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY==="1")return NextResponse.json({error:"Preview is read-only"},{status:403});
 if(!validAdmin(req))return NextResponse.json({error:"Admin key required"},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"Neon database missing"},{status:503});
 try{
 const body=await req.json(),id=Number(body.woo_id);
 if(!Number.isSafeInteger(id)||id<1||!Array.isArray(body.source_ids)||body.source_ids.length>20||body.source_ids.some((s:unknown)=>typeof s!=="string"||s.length>60))return NextResponse.json({error:"Invalid product or selected sources"},{status:400});
 const selected=new Set(body.source_ids as string[]);
 const sql=neon(process.env.DATABASE_URL);
 const row=await sql`SELECT research_draft FROM crm_product_knowledge WHERE woo_id=${id}`;
 if(!row.length)return NextResponse.json({error:"No research available"},{status:404});
 const drafts=(Array.isArray(row[0].research_draft)?row[0].research_draft:[]) as Array<{id?:string;url?:string;title?:string;snippet?:string;source_type?:string}>;
 const accepted=drafts.filter(d=>d.id&&selected.has(d.id)&&typeof d.url==="string"&&d.url.startsWith("https://")&&typeof d.title==="string").slice(0,14);
 if(!accepted.length)return NextResponse.json({error:"Select at least one research result to approve"},{status:400});
 const published=JSON.stringify(accepted);
 await sql`UPDATE crm_product_knowledge SET approved_research=${published}::jsonb,research_status='approved',approved_at=NOW(),updated_at=NOW() WHERE woo_id=${id}`;
 return NextResponse.json({ok:true,approved:accepted.length,message:"Approved sources published to product knowledge. The WhatsApp agent will read the latest approved knowledge after catalog sync."},{headers:{"Cache-Control":"no-store"}});
 }catch{return NextResponse.json({error:"Could not approve research"},{status:502});}
}
