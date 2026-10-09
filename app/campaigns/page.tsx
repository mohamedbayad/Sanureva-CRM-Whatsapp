"use client";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useCrm } from "@/components/use-crm";
import { Loading } from "@/components/Loading";

type Row = { id:string; campaign_id:string; campaign_name:string; ad_id:string; leads:number; orders:number; revenue:number; conversion_rate:number };
type Data = { ok:boolean; campaigns:Row[]; totals:{leads:number;orders:number;revenue:number}; attribution_model:string; campaign_names_complete:boolean; error?:string };
const currency=(n:number)=>new Intl.NumberFormat("es-GT",{style:"currency",currency:"GTQ"}).format(n||0);
export default function CampaignsPage(){
 const crm=useCrm();
 const [data,setData]=useState<Data|null>(null);
 const [error,setError]=useState("");
 const [query,setQuery]=useState("");
 const [loading,setLoading]=useState(true);
 const refresh=async()=>{setLoading(true);try{const r=await fetch("/api/campaign-analytics",{cache:"no-store"});const j=await r.json();if(!r.ok||j.ok===false)throw new Error(j.error||"Analytics unavailable");setData(j);setError("");}catch(e){setError(e instanceof Error?e.message:"Unknown error")}finally{setLoading(false)}};
 useEffect(()=>{void refresh()},[]);
 const rows=useMemo(()=>data?.campaigns.filter(x=>(x.campaign_name+" "+x.ad_id).toLowerCase().includes(query.toLowerCase()))||[],[data,query]);
 if(!data && loading)return <Loading/>;
 return <><PageHeader title="Campaign Analytics" subtitle="WhatsApp ad referrals connected with WooCommerce orders · 7-day last-click attribution" data={crm.data} refresh={refresh}/>
 {error&&<div className="warningBox">{error}</div>}
 {data&&<><section className="metricGrid">{[["Leads",data.totals.leads],["Orders",data.totals.orders],["Revenue",currency(data.totals.revenue)],["Conversion",data.totals.leads?(100*data.totals.orders/data.totals.leads).toFixed(1)+"%":"—"]].map(([label,value])=><div className="metricCard" key={label}><div><span>{label}</span><strong>{value}</strong></div></div>)}</section>
 {!data.campaign_names_complete&&<div className="warningBox">Campaign names are not yet synced from Meta Ads. Rows with Ad ID are real ad references; no campaign names have been guessed.</div>}
 <section className="panel"><div className="toolbar"><strong>Attributed performance</strong><div className="search"><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search campaign / Ad ID"/></div></div><div className="tableWrap"><table><thead><tr><th>Campaign / Ad ID</th><th>Leads</th><th>Orders</th><th>Conversion</th><th>Revenue</th></tr></thead><tbody>{rows.map(x=><tr key={x.id}><td><strong>{x.campaign_name|| (x.ad_id?"Ad "+x.ad_id:"Unknown / Direct")}</strong>{x.campaign_id&&<small>{x.campaign_id}</small>}</td><td>{x.leads}</td><td>{x.orders}</td><td>{x.conversion_rate}%</td><td>{currency(x.revenue)}</td></tr>)}</tbody></table>{!rows.length&&<div className="emptyState">No attributed leads or orders yet.</div>}</div></section>
 <p style={{fontSize:12,color:"#718096",marginTop:12}}>Orders are deduplicated by WooCommerce Order ID. Cancelled, failed and refunded orders do not contribute to revenue. Attribution uses the latest tracked ad within seven days; it is not Meta-reported ROAS.</p></>}
 </>;
}