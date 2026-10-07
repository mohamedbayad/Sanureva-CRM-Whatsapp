"use client";

import { FormEvent, useState } from "react";
import { SendHorizontal } from "lucide-react";
import { useCrm } from "@/components/use-crm";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { StatusBadge } from "@/components/StatusBadge";
import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay, formatDate } from "@/lib/format";
import type { OutboxPayload } from "@/lib/types";

export default function OutboxPage() {
  const { data, loading, error, refresh } = useCrm();
  const [form,setForm]=useState<OutboxPayload>({phone:"",customer:"",orderId:"",type:"Text",message:"",mediaUrl:"",fileName:""});
  const [notice,setNotice]=useState(""); const [sending,setSending]=useState(false);
  async function submit(e:FormEvent){e.preventDefault();setSending(true);setNotice("");try{const r=await fetch("/api/outbox",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});const j=await r.json();if(!r.ok)throw new Error(j.error||"Queue failed");setNotice(`Queued ${j.requestId || j.request_id || "request"}. n8n accepted the message.`);setForm({...form,message:"",mediaUrl:"",fileName:""});setTimeout(refresh,1200)}catch(e){setNotice(e instanceof Error?e.message:"Queue failed")}finally{setSending(false)}}
  if(loading&&!data)return <Loading/>;
  const rows=[...(data?.sheets[SHEET_NAMES.outbox]||[])].reverse();
  return <>
    <PageHeader title="WhatsApp Outbox" subtitle="This page talks only to n8n. n8n keeps the existing WHATSAPP_OUTBOX contract and WhatsApp sender workflow unchanged." data={data} refresh={refresh}/>
    {error&&<div className="warningBox">{error}</div>}
    <div className="outboxGrid">
      <section className="panel"><div className="panelHeader"><div><h2>Queue manual message</h2><p>The web app sends this request to n8n. n8n remains responsible for WhatsApp delivery, Sheet updates and MESSAGES logging.</p></div></div>
        <form className="formGrid" onSubmit={submit}>
          <label>Phone<input required value={form.phone} onChange={e=>setForm({...form,phone:e.target.value})} placeholder="502XXXXXXXX"/></label>
          <label>Customer<input value={form.customer||""} onChange={e=>setForm({...form,customer:e.target.value})}/></label>
          <label>Order ID<input value={form.orderId||""} onChange={e=>setForm({...form,orderId:e.target.value})}/></label>
          <label>Type<select value={form.type} onChange={e=>setForm({...form,type:e.target.value as OutboxPayload["type"]})}><option>Text</option><option>Image</option><option>PDF</option><option>Video</option></select></label>
          {form.type!=="Text"&&<label className="full">Media URL<input required value={form.mediaUrl||""} onChange={e=>setForm({...form,mediaUrl:e.target.value})} placeholder="https://..."/></label>}
          {form.type==="PDF"&&<label className="full">File name<input value={form.fileName||""} onChange={e=>setForm({...form,fileName:e.target.value})} placeholder="document.pdf"/></label>}
          <label className="full">Message / Caption<textarea value={form.message||""} onChange={e=>setForm({...form,message:e.target.value})}/></label>
          <button className="primaryButton full" disabled={sending||!data}><SendHorizontal size={17}/>{sending?"Queueing…":"Add to WHATSAPP_OUTBOX"}</button>
          {notice&&<div className="composeNotice full">{notice}</div>}
        </form>
      </section>
      <section className="panel"><div className="panelHeader"><div><h2>Queue status</h2><p>Updated by your current Outbox Sender + WhatsApp status callbacks.</p></div></div><div className="outboxList">{rows.map((r,i)=><div className="outboxRow" key={`${cleanDisplay(r["Request ID"])}-${i}`}><div><strong>{cleanDisplay(r["Customer"])||cleanDisplay(r["Phone"])||"Unknown"}</strong><span>{cleanDisplay(r["Type"])} · {cleanDisplay(r["Request ID"])}</span><small>{cleanDisplay(r["Message / Caption"]).slice(0,100)||cleanDisplay(r["Media URL"])}</small></div><div className="outboxRight"><StatusBadge value={r["Status"]||r["Action"]}/><time>{formatDate(r["Sent At"])}</time></div></div>)}</div></section>
    </div>
  </>;
}
