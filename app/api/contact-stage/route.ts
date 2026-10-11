import {NextRequest,NextResponse} from "next/server";
import {neon} from "@neondatabase/serverless";
export const dynamic="force-dynamic";
export async function POST(request:NextRequest){
 try{
  const {phone}=await request.json();
  if(typeof phone!=="string"||!/^[0-9]{8,15}$/.test(phone))return NextResponse.json({error:"Invalid phone"},{status:400});
  if(!process.env.DATABASE_URL)return NextResponse.json({error:"Database unavailable"},{status:503});
  const sql=neon(process.env.DATABASE_URL);
  const rows=await sql`SELECT stage,last_order_id,bot_paused,opted_out FROM crm_contact_stages WHERE phone_e164=${phone} LIMIT 1`;
  return NextResponse.json({ok:true,stage:rows[0]?.stage||"new_lead",bot_paused:rows[0]?.bot_paused||false,opted_out:rows[0]?.opted_out||false},{headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({error:"Status unavailable"},{status:502});}
}
