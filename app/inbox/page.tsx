"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { Paperclip, Search, SendHorizontal, FileText, Image as ImageIcon, Video, MessageSquareText, Package, ChevronDown } from "lucide-react";
import { useCrm } from "@/components/use-crm";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { MediaBubble, chatPreview } from "@/components/MediaBubble";
import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay, dateValue, formatDate, normalizePhone } from "@/lib/format";
import type { OutboxPayload, SheetRecord } from "@/lib/types";

function byLatest(messages: SheetRecord[], conversationId: string) {
  return messages.filter((m) => cleanDisplay(m["Conversation ID"]) === conversationId).sort((a,b)=>dateValue(a.Timestamp)-dateValue(b.Timestamp));
}

export default function InboxPage() {
  const previewReadonly = process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1";
  const { data, loading, error, refresh } = useCrm();
  const [selected, setSelected] = useState("");
  const [q, setQ] = useState("");
  const [text, setText] = useState("");
  const [type, setType] = useState<OutboxPayload["type"]>("Text");
  const [mediaUrl, setMediaUrl] = useState("");
  const [fileName, setFileName] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState("");
  const [templates, setTemplates] = useState<Array<{id:number;name:string;kind:string;content:string;stage:string|null;language:string}>>([]);
  const [templateId, setTemplateId] = useState("");
  const [templatesError, setTemplatesError] = useState("");
  const [liveStage, setLiveStage] = useState<string>("");
  const [purchaseDate,setPurchaseDate]=useState("");
  const [purchaseNotes,setPurchaseNotes]=useState("");
  const [purchaseKey,setPurchaseKey]=useState("");
  const [purchaseNotice,setPurchaseNotice]=useState("");
  const [purchaseSaving,setPurchaseSaving]=useState(false);
  const [purchaseReminders,setPurchaseReminders]=useState<Array<{id:number;planned_at:string;status:string}>>([]);
  const [followupDrafts,setFollowupDrafts]=useState<Array<{job_id:number;topic:string;proposed_text:string|null;review_decision:string;approval_status:string;rationale:string}>>([]);
  const [selectedDraft,setSelectedDraft]=useState<number|null>(null);
  const [draftText,setDraftText]=useState("");
  const [adminKey,setAdminKey]=useState("");
  const [draftNotice,setDraftNotice]=useState("");
  const [draftSaving,setDraftSaving]=useState(false);
  useEffect(()=>{ let live=true; fetch("/api/journeys",{cache:"no-store"}).then(r=>r.json()).then(j=>{if(live&&Array.isArray(j.templates))setTemplates(j.templates);else if(live)setTemplatesError("Templates unavailable")}).catch(()=>{if(live)setTemplatesError("Templates unavailable")}); return()=>{live=false}; },[]);
  const applyTemplate=(id:string)=>{setTemplateId(id);const found=templates.find(x=>String(x.id)===id);if(!found)return;if(found.kind==="audio"){setNotice("Audio templates are scripts only. Audio sending is not yet supported by the current n8n sender.");return;}setText(found.content);setNotice("");};

  const conversations = data?.sheets[SHEET_NAMES.conversations] || [];
  const messages = data?.sheets[SHEET_NAMES.messages] || [];
  const orders = data?.sheets[SHEET_NAMES.orders] || [];

  const ranked = useMemo(() => conversations.map((c) => {
    const id = cleanDisplay(c["Conversation ID"]);
    const thread = byLatest(messages, id);
    const last = thread[thread.length - 1];
    return { c, id, last, lastAt: dateValue(last?.Timestamp || c["Started At"]) };
  }).filter((x)=>!q || [x.c["Customer Name"],x.c["Customer Phone"],x.c["Intent / Topic"],x.last?.["Message Content Snippet"]].some((v)=>cleanDisplay(v).toLowerCase().includes(q.toLowerCase()))).sort((a,b)=>b.lastAt-a.lastAt), [conversations, messages, q]);

  const activeId = selected || ranked[0]?.id || "";
  const active = conversations.find((c)=>cleanDisplay(c["Conversation ID"])===activeId);
  const thread = useMemo(()=>byLatest(messages, activeId), [messages, activeId]);
  const phone = normalizePhone(active?.["Customer Phone"]);
  const relatedOrder = orders.find((o)=>normalizePhone(o["Phone Number"])===phone);
  const orderId = cleanDisplay(active?.["Order ID"]) || cleanDisplay(relatedOrder?.["Order ID"]);
  const stage = liveStage || cleanDisplay(active?.["Status"]) || "New lead";
  useEffect(()=>{ if(!phone){return;} let activeRequest=true; setLiveStage(""); fetch("/api/contact-stage",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})}).then(r=>r.json()).then(x=>{if(activeRequest&&x.ok)setLiveStage(x.stage)}).catch(()=>{}); return()=>{activeRequest=false}; },[phone]);
  useEffect(()=>{if(!phone){setFollowupDrafts([]);return;}let live=true;setFollowupDrafts([]);setSelectedDraft(null);setDraftText("");fetch("/api/followup-drafts",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})}).then(r=>r.json()).then(j=>{if(live&&j.ok&&Array.isArray(j.drafts))setFollowupDrafts(j.drafts)}).catch(()=>{});return()=>{live=false}},[phone]);
  useEffect(()=>{if(!phone){setPurchaseReminders([]);return;}let live=true;setPurchaseReminders([]);setPurchaseNotice("");fetch("/api/purchase-reminders",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({phone})}).then(r=>r.json()).then(j=>{if(live&&j.ok)setPurchaseReminders(j.reminders||[])}).catch(()=>{});return()=>{live=false}},[phone]);
  const savePurchaseReminder=async()=>{if(!phone||!purchaseDate)return;setPurchaseSaving(true);setPurchaseNotice("");try{
    const planned_at=purchaseDate+":00-06:00";
    const reminder_text="¡Hola! 😊 Como quedamos, te escribimos de Sanureva para retomar tu pedido. ¿Te viene bien que continuemos ahora? Con gusto te ayudo.";
    const r=await fetch("/api/purchase-reminders",{method:"PUT",headers:{"Content-Type":"application/json","x-template-admin-key":purchaseKey},body:JSON.stringify({phone,planned_at,notes:purchaseNotes,reminder_text})});const j=await r.json();if(!r.ok)throw Error(j.error||"Save failed");setPurchaseNotice("Reminder saved as DRAFT. No message sent.");setPurchaseReminders(x=>[{...j.reminder},...x]);setLiveStage("scheduled_purchase");
  }catch(e){setPurchaseNotice(e instanceof Error?e.message:"Save failed")}finally{setPurchaseSaving(false)}};
  const delivery = cleanDisplay(relatedOrder?.["Delivery Status"]) || "Not available";
  const chooseDraft=(id:number)=>{const draft=followupDrafts.find(d=>Number(d.job_id)===id);setSelectedDraft(id);setDraftText(draft?.proposed_text||"");setDraftNotice("")};
  const saveDraft=async()=>{if(!selectedDraft||!draftText.trim())return;setDraftSaving(true);setDraftNotice("");try{const r=await fetch("/api/followup-drafts",{method:"PATCH",headers:{"Content-Type":"application/json","x-template-admin-key":adminKey},body:JSON.stringify({job_id:selectedDraft,proposed_text:draftText})});const j=await r.json();if(!r.ok)throw Error(j.error||"Could not save");setFollowupDrafts(ds=>ds.map(d=>Number(d.job_id)===selectedDraft?{...d,proposed_text:draftText,approval_status:"needs_review"}:d));setDraftNotice("Saved as draft. Nothing was sent.")}catch(e){setDraftNotice(e instanceof Error?e.message:"Save failed")}finally{setDraftSaving(false)}};


  async function send(e: FormEvent) {
    e.preventDefault();
    if (previewReadonly || !active || !phone) return;
    setSending(true); setNotice("");
    try {
      const response = await fetch("/api/outbox", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ phone, customer: cleanDisplay(active["Customer Name"]), orderId, type, message:text, mediaUrl, fileName }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not queue message");
      setNotice(`Queued as ${json.requestId || json.request_id || "request"}. n8n accepted the message.`);
      setText(""); setMediaUrl(""); setFileName(""); setTemplateId("");
      window.setTimeout(refresh, 1200);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Send failed"); }
    finally { setSending(false); }
  }

  if (loading && !data) return <Loading/>;
  return <>
    <PageHeader title="WhatsApp Inbox" subtitle={previewReadonly ? "Read-only Neon preview · WhatsApp sending is disabled. Original attachments use signed, protected links; browser playback testing is pending." : "Live CRM view served by n8n. Manual replies are sent to n8n, which keeps the existing WhatsApp, Sheet and WooCommerce logic in control."} data={data} refresh={refresh}/>
    {error && <div className="warningBox">{error}</div>}
    <section className="inboxPanel">
      <aside className="chatList">
        <div className="chatSearch"><Search size={16}/><input placeholder="Search chats…" value={q} onChange={(e)=>setQ(e.target.value)}/></div>
        <div className="chatRows">{ranked.map(({c,id,last})=><button key={id} className={activeId===id?"chatRow selected":"chatRow"} onClick={()=>setSelected(id)}><div className="avatar">{(cleanDisplay(c["Customer Name"]) || "?").slice(0,1).toUpperCase()}</div><div className="chatMeta"><div><strong>{cleanDisplay(c["Customer Name"]) || cleanDisplay(c["Customer Phone"])}</strong><time>{formatDate(last?.Timestamp || c["Started At"])}</time></div><span>{chatPreview(last) || cleanDisplay(c["Intent / Topic"]) || "No messages"}</span></div></button>)}</div>
      </aside>
      <div className="conversation">
        {active ? <>
          <div className="conversationHead"><div><strong>{cleanDisplay(active["Customer Name"]) || "Customer"}</strong><span>{phone} {orderId ? `· Order #${orderId}` : ""}</span></div><div className="inboxHeadTags"><span className="pill success">{stage}</span><span className="pill subtle"><Package size={12}/>{delivery}</span></div></div>
          <div className="messages">{thread.length ? thread.map((m,i)=>{ const inbound=cleanDisplay(m.Direction).toLowerCase().includes("inbound"); return <div key={`${cleanDisplay(m["Message ID"])}-${i}`} className={inbound?"bubbleRow inbound":"bubbleRow outbound"}><div className="bubble"><MediaBubble message={m} /><small>{cleanDisplay(m["Message Type"])} · {cleanDisplay(m["Delivery Status"])} · {formatDate(m.Timestamp)}</small></div></div> }) : <div className="emptyState">No logged messages for this conversation.</div>}</div>
          <section className="inboxDraftPanel">
            <div className="inboxDraftHeader"><strong>Scheduled Purchase · Record a follow-up date</strong><span>Draft only</span></div>
            <p style={{fontSize:11,margin:0,color:"#627768"}}>Customer asked to buy later? Choose their agreed date and time in Guatemala. Nothing is sent automatically.</p>
            <label style={{fontSize:11}}>Guatemala date &amp; time <input type="datetime-local" aria-label="Purchase reminder date in Guatemala" value={purchaseDate} onChange={e=>setPurchaseDate(e.target.value)}/></label>
            <input value={purchaseNotes} maxLength={500} placeholder="Reason or customer agreement (optional)" onChange={e=>setPurchaseNotes(e.target.value)}/>
            <input type="password" autoComplete="off" placeholder="Admin key to save" value={purchaseKey} onChange={e=>setPurchaseKey(e.target.value)}/>
            <button type="button" className="inboxMediaChoice active" disabled={purchaseSaving||!purchaseKey||!purchaseDate||previewReadonly} onClick={savePurchaseReminder}>{purchaseSaving?"Saving…":"Save purchase reminder (draft)"}</button>
            {purchaseReminders.map(x=><small key={x.id}>#{x.id} · {new Date(x.planned_at).toLocaleString("es-GT",{timeZone:"America/Guatemala"})} · {x.status}</small>)}
            {purchaseNotice&&<small role="status">{purchaseNotice}</small>}
          </section>
          {followupDrafts.length>0&&<section className="inboxDraftPanel">
            <div className="inboxDraftHeader"><strong>Follow-up drafts · Review only</strong><span>{followupDrafts.length} draft(s)</span></div>
            <select aria-label="Select a follow-up draft" value={selectedDraft??""} onChange={e=>chooseDraft(Number(e.target.value))}><option value="">Choose suggested follow-up…</option>{followupDrafts.map(d=><option key={d.job_id} value={d.job_id}>#{d.job_id} · {d.topic} · {d.review_decision}</option>)}</select>
            {selectedDraft!==null&&<div className="inboxDraftEditor"><p>{followupDrafts.find(d=>Number(d.job_id)===selectedDraft)?.rationale}</p><textarea aria-label="Edit follow-up draft" value={draftText} onChange={e=>setDraftText(e.target.value)} rows={4} maxLength={2500}/><input type="password" aria-label="Template admin key" autoComplete="off" placeholder="Admin key to save draft" value={adminKey} onChange={e=>setAdminKey(e.target.value)}/><button type="button" disabled={!adminKey||!draftText.trim()||draftSaving||previewReadonly} onClick={saveDraft}>{draftSaving?"Saving…":"Save draft only"}</button>{draftNotice&&<small role="status">{draftNotice}</small>}</div>}
            <small>Saving a draft never sends a WhatsApp message. Review order status and messaging permission separately.</small>
          </section>}
          {previewReadonly ? (
            <div className="composer" role="status"><strong>Read-only preview</strong><p>Sending is disabled in preview mode.</p></div>
          ) : <form className="composer" onSubmit={send}>
            <div className="inboxComposerHeading"><span><MessageSquareText size={16}/> Reply to {cleanDisplay(active["Customer Name"]) || "customer"}</span><small>Manual send via existing n8n Outbox</small></div>
            <div className="inboxTemplateRow">
              <label className="inboxTemplateSelect"><FileText size={17}/><select aria-label="Choose message template" value={templateId} onChange={e=>applyTemplate(e.target.value)}>
                <option value="">Choose a message template…</option>
                {templates.map(t=><option key={t.id} value={t.id}>{t.name} · {t.language}{t.kind==="audio"?" (audio script only)":""}</option>)}
              </select><ChevronDown size={15}/></label>
              {templatesError&&<small>{templatesError}</small>}
            </div>
            <div className="inboxMediaChoices">
              {([["Text",MessageSquareText],["Image",ImageIcon],["PDF",FileText],["Video",Video]] as const).map(([value,Icon])=><button type="button" key={value} className={type===value?"inboxMediaChoice active":"inboxMediaChoice"} onClick={()=>{setType(value);setNotice("")}}><Icon size={15}/>{value}</button>)}
              <span className="inboxAudioHint">Audio: sender integration pending</span>
            </div>
            {type!=="Text"&&<div className="inboxAttachmentFields"><label><Paperclip size={16}/><input aria-label="Media URL" type="url" required placeholder={type==="PDF"?"Paste public PDF URL":"Paste public "+type.toLowerCase()+" URL"} value={mediaUrl} onChange={e=>setMediaUrl(e.target.value)}/></label>{type==="PDF"&&<input aria-label="Document filename" value={fileName} placeholder="document.pdf" onChange={e=>setFileName(e.target.value)}/>}</div>}
            <div className="composeMain"><textarea value={text} onChange={e=>setText(e.target.value)} placeholder={type==="Text"?"Write a message or select a template…":"Caption (optional)"} /><button disabled={sending || !data || (type==="Text"?!text.trim():!mediaUrl.trim())} title="Queue through n8n"><SendHorizontal size={18}/>{sending?"Queueing…":"Send"}</button></div>
            <div className="inboxComposerFooter"><small>One attachment per message. Public media URL required for Image, PDF and Video. Templates are editable before sending.</small></div>
            {notice && <div className="composeNotice" role="status">{notice}</div>}
          </form>}
        </> : <div className="emptyState">No conversation selected.</div>}
      </div>
    </section>
  </>;
}
