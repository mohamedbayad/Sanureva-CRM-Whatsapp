"use client";
import { useEffect, useMemo, useState } from "react";
import { PageHeader } from "@/components/PageHeader";
import { useCrm } from "@/components/use-crm";
import { Loading } from "@/components/Loading";

type CampaignRow = {
 id:string; campaign_id:string; campaign_name:string; ad_id:string; leads:number;
 orders:number; revenue:number; conversion_rate:number; delivered_contacts?:number
};
type Analytics = {
 ok:boolean; campaigns:CampaignRow[];
 totals:{leads:number;orders:number;revenue:number;delivered_contacts?:number;unattributed_crm_orders?:number};
 attribution_model:string;campaign_names_complete:boolean;meta_ads_connected?:boolean;
 data_status?:string; generatedAt?:string; messaging_activity?:{unique_contacts_reached?:number};
 data_quality?:{lead_table_rows?:number;attributed_order_rows?:number;crm_order_rows?:number;missing_campaign_names?:number};
 error?:string
};
const money=(value:number)=>new Intl.NumberFormat("es-GT",{style:"currency",currency:"GTQ"}).format(Number(value)||0);
const fmt=(n:number)=>new Intl.NumberFormat("es-GT").format(Number(n)||0);

export default function CampaignsPage() {
 const crm=useCrm();
 const [data,setData]=useState<Analytics|null>(null);
 const [error,setError]=useState("");
 const [query,setQuery]=useState("");
 const [loading,setLoading]=useState(true);
 const [synced,setSynced]=useState("");
 const refresh=async()=>{
   setLoading(true);
   try {
     const response=await fetch("/api/campaign-analytics",{cache:"no-store"});
     const result=await response.json();
     if(!response.ok||!result.ok) throw new Error(result.error||"Campaign analytics unavailable");
     setData(result);setError("");setSynced(new Date().toISOString());
   }catch(e){setError(e instanceof Error?e.message:"Could not load analytics")}
   finally{setLoading(false)}
 };
 useEffect(()=>{void refresh()},[]);
 const rows=useMemo(()=>data?.campaigns.filter(x=>
   [x.campaign_name,x.campaign_id,x.ad_id].join(" ").toLowerCase().includes(query.trim().toLowerCase())
 )||[],[data,query]);
 if(!data&&loading)return <Loading/>;
 const hasLeads=Number(data?.totals.leads||0)>0;
 return <>
  <PageHeader title="Campaign Analytics" subtitle="Click-to-WhatsApp leads, attributed WooCommerce orders and delivery activity. Sources and limitations are shown below." data={crm.data} refresh={refresh}/>
  {error&&<div className="warningBox" role="alert">{error}</div>}
  {data&&<>
   <section className="metricGrid">
    {([
      ["Tracked ad leads",fmt(data.totals.leads)],
      ["Delivered contacts (attributed)",fmt(data.totals.delivered_contacts||0)],
      ["Attributed orders",fmt(data.totals.orders)],
      ["Attributed revenue",money(data.totals.revenue)],
      ["Lead → order rate",hasLeads?(data.totals.orders*100/data.totals.leads).toFixed(1)+"%":"—"],
      ["CRM orders not attributed",fmt(data.totals.unattributed_crm_orders||0)]
    ] as const).map(([label,value])=><div className="metricCard" key={label}><div><span>{label}</span><strong>{value}</strong></div></div>)}
   </section>
   {!hasLeads&&<div className="warningBox"><strong>No campaign referrals recorded yet.</strong> The tracking tables currently contain no captured ad leads or attributed orders. This does not mean the campaigns generated zero results — it means the system cannot attribute them from the data recorded so far. Tracking applies to eligible new Click-to-WhatsApp referrals.</div>}
   {!data.meta_ads_connected&&<div className="warningBox"><strong>Meta Ads Insights not connected.</strong> Spend, impressions, clicks, campaign/ad set names, cost per lead and ROAS cannot be calculated from WhatsApp messages alone. No estimates are shown as facts.</div>}
   {hasLeads&&!data.campaign_names_complete&&<div className="warningBox">Ad IDs were captured from WhatsApp referrals, but some campaign names still need to be synced from Meta Ads.</div>}
   <section className="panel">
    <div className="toolbar"><strong>Tracked ad performance</strong><div className="search"><input aria-label="Search campaign or ad ID" value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search campaign / Ad ID"/></div></div>
    <div className="tableWrap"><table><thead><tr><th>Campaign / Ad ID</th><th>Leads</th><th>Delivered</th><th>Orders</th><th>Lead → order</th><th>Revenue</th></tr></thead><tbody>
      {rows.map(x=><tr key={x.id}><td><strong>{x.campaign_name|| (x.ad_id?"Ad "+x.ad_id:"Unknown / Direct")}</strong>{x.campaign_id&&<small>{x.campaign_id}</small>}</td><td>{fmt(x.leads)}</td><td>{fmt(x.delivered_contacts||0)}</td><td>{fmt(x.orders)}</td><td>{x.leads?x.conversion_rate+"%":"—"}</td><td>{money(x.revenue)}</td></tr>)}
    </tbody></table>{!rows.length&&<div className="emptyState">{hasLeads?"No campaigns match this search.":"No captured ad referrals yet."}</div>}</div>
   </section>
   <section className="panel" style={{marginTop:16,padding:18}}>
    <strong>Data coverage</strong>
    <p style={{fontSize:12,color:"#718096",lineHeight:1.7}}>
      CRM messages with delivered/read status: <b>{fmt(data.messaging_activity?.unique_contacts_reached||0)}</b> unique contacts, across all tracked sources.
      {" "}Historical CRM orders: <b>{fmt(data.data_quality?.crm_order_rows||0)}</b>. Captured ad leads: <b>{fmt(data.data_quality?.lead_table_rows||0)}</b>. Orders in attribution table: <b>{fmt(data.data_quality?.attributed_order_rows||0)}</b>.
    </p>
    <p style={{fontSize:12,color:"#718096",lineHeight:1.7,marginBottom:0}}>
      Attribution: latest tracked Click-to-WhatsApp ad in the prior 7 days. Orders are deduplicated by WooCommerce Order ID; cancelled, failed and refunded order values are excluded from revenue. Delivered means a WhatsApp message reached a contact, not shipment delivery. Figures come from n8n and WooCommerce, not Meta-reported conversions or ROAS.
      {synced&&<> Last refreshed: {new Date(synced).toLocaleString("es-GT")}.</>}
    </p>
   </section>
  </>}
 </>;
}
