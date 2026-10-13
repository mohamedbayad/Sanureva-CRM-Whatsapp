import { NextRequest, NextResponse } from "next/server";
import { neon } from "@neondatabase/serverless";
import { timingSafeEqual } from "node:crypto";
export const dynamic="force-dynamic";
const noCache={"Cache-Control":"private, no-store"};
const fields=["benefits","positioning","ingredients","usage","faq","notes","safety_notes"] as const;
function admin(req:NextRequest){const k=process.env.CRM_TEMPLATE_ADMIN_KEY||"",v=req.headers.get("x-template-admin-key")||"";if(!k||!v)return false;const a=Buffer.from(k),b=Buffer.from(v);return a.length===b.length&&timingSafeEqual(a,b)}
function readonly(){return process.env.VERCEL_ENV==="preview"||process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY==="1"}
export async function GET(req:NextRequest){
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"Database unavailable"},{status:503});
 try{
 const id=Number(req.nextUrl.searchParams.get("id")||0),sql=neon(process.env.DATABASE_URL);
 if(id && (!Number.isSafeInteger(id)||id<1))return NextResponse.json({error:"Invalid product ID"},{status:400});
 if(id){
 const rows=await sql`SELECT p.woo_id,p.name,p.slug,p.price,p.currency,p.stock_status,p.product_url,p.image_url,p.last_synced_at,p.woo_data,
 k.benefits,k.positioning,k.ingredients,k.usage,k.faq,k.notes,k.safety_notes,k.research_draft,k.approved_research,k.research_status,k.last_researched_at,k.approved_at,k.updated_at
 FROM crm_products p LEFT JOIN crm_product_knowledge k ON k.woo_id=p.woo_id WHERE p.woo_id=${id} LIMIT 1`;
 if(!rows.length)return NextResponse.json({error:"Product not found"},{status:404});
 return NextResponse.json({ok:true,product:rows[0]},{headers:noCache});
 }
 const rows=await sql`SELECT p.woo_id,p.name,p.slug,p.price,p.currency,p.stock_status,p.product_url,p.image_url,p.last_synced_at,
 COALESCE(k.research_status,'not_started') AS research_status,k.updated_at,
 jsonb_array_length(COALESCE(k.approved_research,'[]'::jsonb)) AS approved_sources
 FROM crm_products p LEFT JOIN crm_product_knowledge k ON k.woo_id=p.woo_id ORDER BY p.name LIMIT 150`;
 return NextResponse.json({ok:true,products:rows},{headers:noCache});
 }catch{return NextResponse.json({error:"Could not retrieve products"},{status:502});}
}
export async function PATCH(req:NextRequest){
 if(readonly())return NextResponse.json({error:"Preview is read-only"},{status:403});
 if(!admin(req))return NextResponse.json({error:"Admin key missing or invalid; configure CRM_TEMPLATE_ADMIN_KEY on Vercel"},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"Database unavailable"},{status:503});
 try{
 const body=await req.json(),id=Number(body.woo_id);
 if(!Number.isSafeInteger(id)||id<1)return NextResponse.json({error:"Invalid ID"},{status:400});
 const values=Object.fromEntries(fields.map(k=>[k,String(body[k]||"").trim()]));
 if(fields.some(k=>values[k].length>8000))return NextResponse.json({error:"Field exceeds 8000 characters"},{status:400});
 const sql=neon(process.env.DATABASE_URL);
 const rows=await sql`INSERT INTO crm_product_knowledge(woo_id,benefits,positioning,ingredients,usage,faq,notes,safety_notes)
 SELECT p.woo_id,${values.benefits},${values.positioning},${values.ingredients},${values.usage},${values.faq},${values.notes},${values.safety_notes} FROM crm_products p WHERE p.woo_id=${id}
 ON CONFLICT(woo_id) DO UPDATE SET benefits=EXCLUDED.benefits,positioning=EXCLUDED.positioning,ingredients=EXCLUDED.ingredients,usage=EXCLUDED.usage,faq=EXCLUDED.faq,notes=EXCLUDED.notes,safety_notes=EXCLUDED.safety_notes,updated_at=now()
 RETURNING woo_id,updated_at`;
 if(!rows.length)return NextResponse.json({error:"WooCommerce product not found"},{status:404});
 return NextResponse.json({ok:true,record:rows[0]},{headers:noCache});
 }catch{return NextResponse.json({error:"Could not save product information"},{status:500});}
}
