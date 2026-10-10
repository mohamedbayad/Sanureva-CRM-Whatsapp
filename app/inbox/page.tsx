"use client";

import { FormEvent, useMemo, useState } from "react";
import { Paperclip, Search, SendHorizontal } from "lucide-react";
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
  const orderId = cleanDisplay(active?.["Order ID"]) || cleanDisplay(orders.find((o)=>normalizePhone(o["Phone Number"])===phone)?.["Order ID"]);

  async function send(e: FormEvent) {
    e.preventDefault();
    if (previewReadonly || !active || !phone) return;
    setSending(true); setNotice("");
    try {
      const response = await fetch("/api/outbox", { method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify({ phone, customer: cleanDisplay(active["Customer Name"]), orderId, type, message:text, mediaUrl, fileName }) });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Could not queue message");
      setNotice(`Queued as ${json.requestId || json.request_id || "request"}. n8n accepted the message.`);
      setText(""); setMediaUrl(""); setFileName("");
      window.setTimeout(refresh, 1200);
    } catch (e) { setNotice(e instanceof Error ? e.message : "Send failed"); }
    finally { setSending(false); }
  }

  if (loading && !data) return <Loading/>;
  return <>
    <PageHeader title="WhatsApp Inbox" subtitle={previewReadonly ? "Read-only Neon preview · message sending is disabled. Original WhatsApp media has not yet been verified." : "Live CRM view served by n8n. Manual replies are sent to n8n, which keeps the existing WhatsApp, Sheet and WooCommerce logic in control."} data={data} refresh={refresh}/>
    {error && <div className="warningBox">{error}</div>}
    <section className="inboxPanel">
      <aside className="chatList">
        <div className="chatSearch"><Search size={16}/><input placeholder="Search chats…" value={q} onChange={(e)=>setQ(e.target.value)}/></div>
        <div className="chatRows">{ranked.map(({c,id,last})=><button key={id} className={activeId===id?"chatRow selected":"chatRow"} onClick={()=>setSelected(id)}><div className="avatar">{(cleanDisplay(c["Customer Name"]) || "?").slice(0,1).toUpperCase()}</div><div className="chatMeta"><div><strong>{cleanDisplay(c["Customer Name"]) || cleanDisplay(c["Customer Phone"])}</strong><time>{formatDate(last?.Timestamp || c["Started At"])}</time></div><span>{chatPreview(last) || cleanDisplay(c["Intent / Topic"]) || "No messages"}</span></div></button>)}</div>
      </aside>
      <div className="conversation">
        {active ? <>
          <div className="conversationHead"><div><strong>{cleanDisplay(active["Customer Name"]) || "Customer"}</strong><span>{phone} {orderId ? `· Order #${orderId}` : ""}</span></div><span className="pill subtle">{cleanDisplay(active["Intent / Topic"]) || "WhatsApp"}</span></div>
          <div className="messages">{thread.length ? thread.map((m,i)=>{ const inbound=cleanDisplay(m.Direction).toLowerCase().includes("inbound"); return <div key={`${cleanDisplay(m["Message ID"])}-${i}`} className={inbound?"bubbleRow inbound":"bubbleRow outbound"}><div className="bubble"><MediaBubble message={m} /><small>{cleanDisplay(m["Message Type"])} · {cleanDisplay(m["Delivery Status"])} · {formatDate(m.Timestamp)}</small></div></div> }) : <div className="emptyState">No logged messages for this conversation.</div>}</div>
          {previewReadonly ? (
            <div className="composer" role="status"><strong>Read-only preview</strong><p>No WhatsApp messages can be sent from this environment. Original media links are not available until the secure media migration is verified.</p></div>
          ) : <form className="composer" onSubmit={send}>
            <div className="composeTop"><select value={type} onChange={(e)=>setType(e.target.value as OutboxPayload["type"])}><option>Text</option><option>Image</option><option>PDF</option><option>Video</option></select>{type!=="Text" && <><div className="fieldInline"><Paperclip size={15}/><input value={mediaUrl} onChange={(e)=>setMediaUrl(e.target.value)} placeholder="Public media URL"/></div>{type==="PDF" && <input className="fileName" value={fileName} onChange={(e)=>setFileName(e.target.value)} placeholder="file.pdf"/>}</>}</div>
            <div className="composeMain"><textarea value={text} onChange={(e)=>setText(e.target.value)} placeholder={type==="Text"?"Type a manual WhatsApp reply…":"Caption / message (optional)"}/><button disabled={sending || !data} title="Send through n8n"><SendHorizontal size={18}/>{sending?"Queueing…":"Queue"}</button></div>
            {notice && <div className="composeNotice">{notice}</div>}
          </form>}
        </> : <div className="emptyState">No conversation selected.</div>}
      </div>
    </section>
  </>;
}
