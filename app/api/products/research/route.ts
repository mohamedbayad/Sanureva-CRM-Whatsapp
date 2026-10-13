import {NextRequest,NextResponse} from "next/server";
import {neon} from "@neondatabase/serverless";
import {timingSafeEqual,randomUUID} from "node:crypto";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
function allow(r:NextRequest){const expected=process.env.CRM_TEMPLATE_ADMIN_KEY||"",provided=r.headers.get("x-template-admin-key")||"";const a=Buffer.from(expected),b=Buffer.from(provided);return !!expected&&!!provided&&a.length===b.length&&timingSafeEqual(a,b)}
function failReadOnly(){return process.env.VERCEL_ENV==="preview"||process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY==="1"}
type Result={title?:string;link?:string;snippet?:string;date?:string};
type Source={id:string;title:string;url:string;snippet:string;source_type:"commercial"|"research";query:string;topic:string;created_at:string};
function safeUrl(s:string){try{const u=new URL(s);return u.protocol==="https:"&&!u.username&&!u.password&&u.hostname.length>3&&!/^(?:localhost|127\.|10\.|192\.168\.|172\.1[6-9]\.|172\.2\d\.|172\.3[01]\.)/i.test(u.hostname)?u.toString().slice(0,600):""}catch{return ""}}
function normalize(s:string){return s.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase()}
async function serper(key:string,query:string){
 const r=await fetch("https://google.serper.dev/search",{method:"POST",headers:{"X-API-KEY":key,"Content-Type":"application/json"},body:JSON.stringify({q:query,gl:"gt",hl:"es",num:8}),signal:AbortSignal.timeout(16000),cache:"no-store"});
 if(!r.ok)throw new Error("Serper rejected request ("+r.status+")");
 const data:unknown=await r.json();if(!data||typeof data!=="object")throw new Error("Unexpected search response");
 return Array.isArray((data as {organic?:unknown[]}).organic)?(data as {organic:Result[]}).organic:[];
}
export async function POST(req:NextRequest){
 if(failReadOnly())return NextResponse.json({error:"Read-only preview"},{status:403});
 if(!allow(req))return NextResponse.json({error:"Admin key missing or invalid"},{status:401});
 if(!process.env.DATABASE_URL)return NextResponse.json({error:"Neon database missing"},{status:503});
 const key=(process.env.SERPER_API_KEY||"").trim();if(!key)return NextResponse.json({error:"SERPER_API_KEY missing in Vercel Production environment. Add a key from serper.dev to enable Google research."},{status:503});
 try {
 const input=await req.json(),id=Number(input.woo_id),topic=String(input.topic||"beneficios y usos").replace(/[\r\n<>]/g," ").trim().slice(0,85);
 if(!Number.isSafeInteger(id)||id<1||!topic)return NextResponse.json({error:"Invalid product or research topic"},{status:400});
 const sql=neon(process.env.DATABASE_URL);
 const rows=await sql`SELECT woo_id,name,woo_data FROM crm_products WHERE woo_id=${id} LIMIT 1`;
 if(!rows.length)return NextResponse.json({error:"Product not found"},{status:404});
 const p=rows[0],data=p.woo_data as {agent_context?:{product?:{consumer_brand?:string};ingredients_or_components?:{name?:string}[]}};
 const brand=String(data?.agent_context?.product?.consumer_brand||"").trim().slice(0,60);
 const product=String(p.name).split(" - ")[0].trim().slice(0,105);
 const mainIngredient=String(data?.agent_context?.ingredients_or_components?.[0]?.name||"").slice(0,65);
 const productQuery=[brand,product,topic,"beneficios"].filter(Boolean).join(" ").slice(0,220);
 const ingredientQuery=[product.split(/\s+/).slice(0,2).join(" "),mainIngredient,topic,"clinical studies ingredients"].filter(Boolean).join(" ").slice(0,220);
 const [first,second]=await Promise.allSettled([serper(key,productQuery),serper(key,ingredientQuery)]);
 if(first.status==="rejected"&&second.status==="rejected")return NextResponse.json({error:"Both Google searches failed. Verify Serper API key and balance."},{status:502});
 const canonical=normalize(product),brandToken=normalize(brand);const tokens=canonical.split(/[^a-z0-9]+/).filter(x=>x.length>=5&&!["ultra","natural","capsulas","complejo","formula"].includes(x)).slice(0,3);
 const seen=new Set<string>();
 const sources:Source[]=[];
 for(const [kind,result,query] of [["commercial",first,productQuery],["research",second,ingredientQuery]] as const) {
  if(result.status!=="fulfilled")continue;
  for(const hit of result.value.slice(0,8)){
   const url=safeUrl(String(hit.link||""));if(!url||seen.has(url))continue;
   const title=String(hit.title||"").replace(/[\x00-\x1f]/g," ").slice(0,200),snippet=String(hit.snippet||"").replace(/[\x00-\x1f]/g," ").slice(0,600);
   const combined=normalize(title+" "+snippet+" "+url);
   if(kind==="commercial"&&tokens.length&&!tokens.some(t=>combined.includes(t)))continue;
   if(kind==="research"&&tokens.length&&!tokens.some(t=>combined.includes(t))&&!(mainIngredient&&combined.includes(normalize(mainIngredient))))continue;
   if(kind==="commercial"&&brandToken&&brandToken.length>3&&!combined.includes(brandToken)&&!tokens.some(t=>combined.includes(t)))continue;
   seen.add(url);sources.push({id:randomUUID(),title,url,snippet,source_type:kind,query,topic,created_at:new Date().toISOString()});
  }
 }
 const raw=JSON.stringify(sources.slice(0,14));
 await sql`INSERT INTO crm_product_knowledge(woo_id,research_draft,research_status,last_researched_at)
 SELECT woo_id,${raw}::jsonb,'draft',NOW() FROM crm_products WHERE woo_id=${id}
 ON CONFLICT(woo_id) DO UPDATE SET research_draft=EXCLUDED.research_draft,research_status='draft',last_researched_at=now(),updated_at=now()`;
 return NextResponse.json({ok:true,product_id:id,count:sources.length,sources,queries:[productQuery,ingredientQuery],warning:"Search snippets can contain advertising claims. Review sources and approve only information applicable to this exact product. Nothing is sent to WhatsApp automatically."},{headers});
 }catch(err){return NextResponse.json({error:err instanceof Error&&err.name==="TimeoutError"?"Research timed out":"Could not search Google or save research"},{status:502});}
}
