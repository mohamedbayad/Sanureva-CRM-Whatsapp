import { NextResponse } from "next/server";
export const dynamic = "force-dynamic";
export async function GET() {
  const endpoint=(process.env.N8N_CRM_WEBHOOK_URL||"").trim();
  const key=(process.env.N8N_CRM_API_KEY||"").trim();
  if(!endpoint || !key)return NextResponse.json({error:"CRM analytics integration is not configured"},{status:503});
  try {
    const res=await fetch(endpoint,{method:"POST",headers:{"Content-Type":"application/json","X-CRM-Key":key},body:JSON.stringify({action:"campaign_analytics"}),cache:"no-store",signal:AbortSignal.timeout(20000)});
    if(!res.ok)return NextResponse.json({error:"Campaign analytics service unavailable"},{status:502});
    const data=await res.json();
    return NextResponse.json(data,{headers:{"Cache-Control":"private, no-store"}});
  }catch{return NextResponse.json({error:"Could not load campaign analytics"},{status:502});}
}