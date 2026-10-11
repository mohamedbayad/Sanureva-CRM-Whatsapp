"use client";

import { useMemo, useState } from "react";
import "./pipeline.css";
import Link from "next/link";
import { ArrowRight, AudioLines, Check, Copy, Filter, MessageSquareText, Search, ShieldAlert } from "lucide-react";
import { useCrm } from "@/components/use-crm";
import { Loading } from "@/components/Loading";
import { PageHeader } from "@/components/PageHeader";
import { deriveSalesPipeline, PIPELINE_STAGES, templatesFor, type PipelineContact } from "@/lib/sales-pipeline";
import { formatDate } from "@/lib/format";

function time(ts:number){return ts?formatDate(new Date(ts).toISOString()):"—"}
function Lead({c,active,onSelect}:{c:PipelineContact;active:boolean;onSelect:()=>void}){
 const stage=PIPELINE_STAGES.find(x=>x.id===c.stage)?.label||c.stage;
 return <button onClick={onSelect} type="button" className={"pipelineLead"+(active?" pipelineLeadActive":"")}>
  <span className="pipelineLeadHeading"><strong>{c.name}</strong><small>{time(c.lastActivityAt)}</small></span>
  <span className="pipelineLeadMeta"><span>{c.phone}</span><span className="status">{stage}</span></span>
  <span className="pipelineLeadMeta">{c.readNoReply?<b className="pipelineAlert">Read · no reply</b>:c.orderId?<small>Order #{c.orderId}</small>:<small>{c.messageCount} messages</small>}</span>
 </button>;
}

export default function PipelinePage(){
 const {data,error,refresh,loading}=useCrm();
 const [query,setQuery]=useState("");
 const [stageFilter,setStageFilter]=useState("all");
 const [selected,setSelected]=useState("");
 const [templateId,setTemplateId]=useState("");
 const [notice,setNotice]=useState("");
 const [copied,setCopied]=useState("");
 const rows=useMemo(()=>data?deriveSalesPipeline(data):[],[data]);
 const filtered=useMemo(()=>rows.filter(c=>(stageFilter==="all"||c.stage===stageFilter||(stageFilter==="read_no_reply"&&c.readNoReply))
   &&(!query.trim()||[c.name,c.phone,c.orderId,c.stage].join(" ").toLowerCase().includes(query.trim().toLowerCase()))),[rows,query,stageFilter]);
 const active=filtered.find(x=>x.phone===selected)||filtered[0];
 const templates=active?templatesFor(active):[];
 const chosen=templates.find(x=>x.id===templateId)||templates[0];
 const summary={contacts:rows.length,orders:rows.filter(x=>x.orderId).length,inDelivery:rows.filter(x=>["tracking_sent","in_delivery"].includes(x.stage)).length,followups:rows.filter(x=>x.readNoReply).length};
 const counts=new Map(PIPELINE_STAGES.map(x=>[x.id,rows.filter(v=>v.stage===x.id).length]));
 async function copyTemplate(){
  if(!chosen)return;
  try{await navigator.clipboard.writeText(chosen.body);setCopied(chosen.id);setNotice("Template copied. Review the content and WhatsApp service window before sending.");}catch{setNotice("Clipboard unavailable. Select and copy the message manually.")}
 }
 if(loading&&!data)return <Loading/>;
 return <>
  <PageHeader title="Sales Pipeline" subtitle="Per-phone journey, follow-up suggestions and editable Spanish message previews. Current stages are inferred from CRM logs; automatic sending is not enabled." data={data} refresh={refresh}/>
  {error&&<div className="warningBox" role="alert">{error}</div>}
  <section className="metricGrid">
   {([["Contacts",summary.contacts],["With an order",summary.orders],["Tracking / delivery",summary.inDelivery],["Read · no reply",summary.followups]] as const).map(([label,n])=><div className="metricCard" key={label}><div><span>{label}</span><strong>{n}</strong></div></div>)}
  </section>
  <div className="warningBox" role="status"><ShieldAlert size={14} style={{verticalAlign:"middle",marginRight:6}}/>Tracking sent is an <strong>inferred CRM phase</strong>, not proof a parcel was delivered. Delivery requires a verified delivery-status update. WhatsApp read receipts do not prove the customer understood a message. Outbound audio and automated follow-ups are not enabled in this release.</div>
  <div className="pipelineStageStrip">
   <button className={stageFilter==="all"?"selected":""} onClick={()=>setStageFilter("all")}>All <b>{rows.length}</b></button>
   {PIPELINE_STAGES.map(s=><button key={s.id} className={stageFilter===s.id?"selected":""} onClick={()=>setStageFilter(s.id)}>{s.label} <b>{counts.get(s.id)}</b></button>)}
   <button className={stageFilter==="read_no_reply"?"selected":""} onClick={()=>setStageFilter("read_no_reply")}>Read · no reply <b>{summary.followups}</b></button>
  </div>
  <section className="pipelineLayout">
   <aside className="pipelineContactPanel">
    <div className="chatSearch"><Search size={15}/><input aria-label="Filter contacts" placeholder="Search phone, name, order…" value={query} onChange={e=>setQuery(e.target.value)}/><Filter size={14}/></div>
    <div className="pipelineContactList">{filtered.map(c=><Lead key={c.phone} c={c} active={c.phone===active?.phone} onSelect={()=>{setSelected(c.phone);setTemplateId("");setNotice("");setCopied("");}}/>)}{filtered.length===0&&<p className="emptyState">No contacts match these filters.</p>}</div>
   </aside>
   <div className="pipelineDetail">
    {!active?<p className="emptyState">Select a customer to view their journey.</p>:<>
    <div className="pipelineDetailHeading"><div><h2>{active.name}</h2><p>{active.phone} {active.orderId&&<>· Order #{active.orderId}</>}</p></div><span className="status good">{PIPELINE_STAGES.find(x=>x.id===active.stage)?.label||active.stage}</span></div>
    <div className="pipelineFactGrid">
      <div><span>Last customer reply</span><strong>{time(active.lastInboundAt)}</strong></div>
      <div><span>Last outbound</span><strong>{time(active.lastOutboundAt)}</strong></div>
      <div><span>WhatsApp 24h window</span><strong>{active.hasOpenServiceWindow?"Open (inferred)":"Closed / unknown"}</strong></div>
      <div><span>Order status</span><strong>{active.orderStatus||"No order"}</strong></div>
      <div><span>Delivery status</span><strong>{active.courierStatus||"Not provided"}</strong></div>
      <div><span>Read without reply</span><strong>{active.readNoReply?"Yes · follow-up review":"Not detected"}</strong></div>
    </div>
    <div className="pipelineEvidence"><strong>Stage evidence</strong><p>{active.stageEvidence}. This classification is a suggestion until a dedicated journey event confirms it.</p></div>
    <h3 className="pipelineSectionTitle"><MessageSquareText size={16}/> Recommended templates</h3>
    <p className="pipelineHint">Choose a template and copy it for an authorized agent to send. Suggestions do not queue or send WhatsApp messages.</p>
    {templates.length===0?<p>No templates for this stage.</p>:<>
      <label className="pipelineFieldLabel" htmlFor="salesTemplate">Template</label>
      <select id="salesTemplate" className="pipelineSelect" value={chosen?.id||""} onChange={e=>{setTemplateId(e.target.value);setCopied("");setNotice("");}}>
        {templates.map(t=><option key={t.id} value={t.id}>{t.label}{t.mode==="audio_suggestion"?" (audio offer)":""}</option>)}
      </select>
      {chosen&&<div className="pipelineTemplate">
        <div className="pipelineTemplateTop">{chosen.mode==="audio_suggestion"?<><AudioLines size={15}/> Audio offer (text only)</>:<><MessageSquareText size={15}/> Spanish message preview</>}<span>es-GT</span></div>
        <textarea aria-label="Suggested message" key={chosen.id} defaultValue={chosen.body} readOnly rows={5}/>
        <p>{chosen.explanation}</p>
        <button className="pipelineCopy" onClick={copyTemplate}>{copied===chosen.id?<Check size={15}/>:<Copy size={15}/>} {copied===chosen.id?"Copied":"Copy approved draft"}</button>
      </div>}
      {notice&&<p className="pipelineHint" role="status">{notice}</p>}
    </>}
    <div className="pipelineActions"><Link href="/inbox">Open WhatsApp Inbox <ArrowRight size={16}/></Link></div>
    </>}
   </div>
  </section>
 </>;
}
