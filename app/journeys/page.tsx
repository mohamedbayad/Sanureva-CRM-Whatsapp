"use client";
import { useEffect, useState } from "react";
type Row=Record<string,unknown>;
type Payload={ok:boolean;stages:Row[];templates:Row[];jobs:Row[];campaigns:Row[];error?:string};
const t=(v:unknown)=>v===null||v===undefined?"—":String(v);
const num=(v:unknown)=>new Intl.NumberFormat("en-US").format(Number(v)||0);
export default function JourneysPage(){
 const [data,setData]=useState<Payload|null>(null);
 const [error,setError]=useState("");
 const [loading,setLoading]=useState(true);
 const [tab,setTab]=useState<"contacts"|"templates"|"followups"|"campaigns">("contacts");
 const [search,setSearch]=useState("");
 useEffect(()=>{let active=true;fetch("/api/journeys",{cache:"no-store"}).then(async r=>{const x=await r.json();if(!r.ok)throw Error(x.error||"Unable to load");if(active)setData(x)}).catch(e=>{if(active)setError(String(e.message||e))}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
 const rows=(tab==="contacts"?data?.stages:tab==="templates"?data?.templates:tab==="followups"?data?.jobs:data?.campaigns)||[];
 const filtered=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(search.toLowerCase()));
 return <div>
  <div className="panel" style={{padding:22,marginBottom:16}}>
   <h1 style={{margin:"0 0 8px"}}>Customer Journeys & Automation</h1>
   <p>Live Neon overview. Sending and follow-up automation are disabled until verified. No customer messages are sent from this page.</p>
   <div className="warningBox">Safe mode: no automatic WhatsApp sending. Meta Ads Insights clicks/spend are only populated after official data import; empty campaign metrics are not zeros from Meta.</div>
  </div>
  <section className="metricGrid">
   {([["Customer stages",data?.stages.length],["Templates",data?.templates.length],["Follow-up jobs",data?.jobs.length],["Tracked campaigns",data?.campaigns.length]] as const).map(([label,value])=><div className="metricCard" key={label}><div><span>{label}</span><strong>{loading?"…":num(value)}</strong></div></div>)}
  </section>
  {error&&<div className="warningBox" role="alert">{error}</div>}
  <div className="panel">
   <div className="toolbar" style={{flexWrap:"wrap",gap:10}}>
    <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{(["contacts","templates","followups","campaigns"] as const).map(v=><button key={v} onClick={()=>{setTab(v);setSearch("")}} style={{padding:"9px 12px",borderRadius:8,cursor:"pointer",border:"1px solid #d8e0eb",background:tab===v?"#e5edf9":"white",fontWeight:tab===v?700:400}}>{({contacts:"Contacts",templates:"Message templates",followups:"Follow-ups",campaigns:"Campaign tracking"} as const)[v]}</button>)}</div>
    <input aria-label="Search records" placeholder="Search…" value={search} onChange={e=>setSearch(e.target.value)} style={{padding:9,borderRadius:8,border:"1px solid #d8e0eb"}}/>
   </div>
   <div className="tableWrap"><table><thead><tr>
    {(tab==="contacts"?["Phone","Name","Stage","Bot paused","Opted out"]:tab==="templates"?["Template","Language","Stage","Kind","Enabled"]:tab==="followups"?["Phone","Trigger","Template","Due","Status"]:["Campaign","Clicks","Leads","Orders","Spend"]).map(h=><th key={h}>{h}</th>)}
   </tr></thead><tbody>{filtered.map((r,i)=><tr key={t(r.id||r.phone_e164||r.campaign_id||i)}>
    {(tab==="contacts"?[r.phone_e164,r.display_name,r.stage,r.bot_paused,r.opted_out]:tab==="templates"?[r.name,r.language,r.stage,r.kind,r.is_enabled]:tab==="followups"?[r.phone_e164,r.trigger_type,r.template_name,r.due_at,r.status]:[r.campaign_name||r.campaign_id,r.clicks,r.attributed_leads,r.attributed_orders,r.spend]).map((v,j)=><td key={j}>{t(v)}</td>)}
   </tr>)}</tbody></table>
   {!loading&&!filtered.length&&<div className="emptyState">No records available. No messages have been scheduled from this interface.</div>}</div>
  </div>
 </div>
}
