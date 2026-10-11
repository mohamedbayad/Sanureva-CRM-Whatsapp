"use client";
import { useEffect,useState } from "react";
import Link from "next/link";
import { FileText, Save, ShieldCheck, ArrowLeft, CheckCircle2 } from "lucide-react";
type Template={id:number;code:string;name:string;content:string;language:string;stage:string|null;kind:"text"|"audio"|"approved_template";is_enabled:boolean};
const stages=["","new_lead","engaged","needs_explanation","interested","awaiting_address","order_pending","order_confirmed","shipped","out_for_delivery","delivered","failed_delivery","lost","human_handoff"];
export default function TemplateManager(){
 const [rows,setRows]=useState<Template[]>([]),[selected,setSelected]=useState<number|null>(null),[draft,setDraft]=useState<Template|null>(null);
 const [key,setKey]=useState(""),[search,setSearch]=useState(""),[error,setError]=useState(""),[notice,setNotice]=useState(""),[saving,setSaving]=useState(false);
 useEffect(()=>{fetch("/api/journeys",{cache:"no-store"}).then(r=>r.json()).then(data=>{if(!Array.isArray(data.templates))throw Error(data.error||"Could not load templates");setRows(data.templates);if(data.templates.length){setSelected(data.templates[0].id);setDraft({...data.templates[0]})}}).catch(e=>setError(e.message))},[]);
 function choose(t:Template){setSelected(t.id);setDraft({...t});setNotice("");setError("")}
 async function save(){if(!draft)return;setSaving(true);setError("");setNotice("");try{const res=await fetch("/api/templates",{method:"PATCH",headers:{"Content-Type":"application/json","x-template-admin-key":key},body:JSON.stringify(draft)});const j=await res.json();if(!res.ok)throw Error(j.error||"Save failed");const next={...draft,...j.template};setRows(v=>v.map(x=>x.id===next.id?next:x));setDraft(next);setNotice("Template saved in Neon. Inbox will show the new text after refresh.")}catch(e){setError(e instanceof Error?e.message:"Save failed")}finally{setSaving(false)}}
 const visible=rows.filter(x=>[x.name,x.code,x.content,x.stage].join(" ").toLowerCase().includes(search.toLowerCase()));
 return <div className="tmplPage">
  <header className="tmplTop"><div><Link href="/inbox" className="tmplBack"><ArrowLeft size={15}/> Back to Inbox</Link><h1>Message Templates</h1><p>Manage the messages you select inside WhatsApp Inbox.</p></div><span className="tmplSafety"><ShieldCheck size={15}/> Manual sending only</span></header>
  <div className="tmplLayout"><aside className="tmplLeft">
   <div className="tmplListHead"><strong>Templates <span>{rows.length}</span></strong><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search templates…" aria-label="Search templates"/></div>
   <div>{visible.map(t=><button key={t.id} className={"tmplItem"+(selected===t.id?" on":"")} onClick={()=>choose(t)}><span className="tmplItemIcon"><FileText size={17}/></span><span><strong>{t.name}</strong><small>{t.stage||"All stages"} · {t.language} · {t.kind}</small></span><span className={"tmplDot"+(t.is_enabled?" yes":"")}/></button>)}</div>
   {!visible.length&&<p className="tmplHint">No templates found.</p>}
  </aside>
  <section className="tmplEditor">{draft?<><div className="tmplEditorHead"><div><h2>Edit template</h2><span>Changes are saved in Neon and reused in Inbox.</span></div><span className="tmplId">#{draft.id}</span></div>
   <div className="tmplForm">
    <label>Template name<input maxLength={120} value={draft.name} onChange={e=>setDraft({...draft,name:e.target.value})}/></label>
    <div className="tmplColumns"><label>Language<input maxLength={20} value={draft.language} onChange={e=>setDraft({...draft,language:e.target.value})}/></label><label>Customer stage<select value={draft.stage||""} onChange={e=>setDraft({...draft,stage:e.target.value||null})}>{stages.map(x=><option key={x} value={x}>{x||"Any stage"}</option>)}</select></label></div>
    <label>Message content<textarea rows={9} maxLength={4000} value={draft.content} onChange={e=>setDraft({...draft,content:e.target.value})}/><small>{draft.content.length}/4000 characters</small></label>
    <div className="tmplInfo">{draft.kind==="audio"?"Audio is currently a script only. Sending voice notes needs separate integration.":draft.kind==="approved_template"?"Meta-approved WhatsApp templates must also be edited and reapproved in WhatsApp Manager.":"This text can be selected and edited in Inbox before sending."}</div>
    <label className="tmplToggle"><input type="checkbox" checked={draft.is_enabled} onChange={e=>setDraft({...draft,is_enabled:e.target.checked})}/><span><strong>Enabled</strong><small>Marks this template as active in the database; does not start automatic sending.</small></span></label>
    <div className="tmplAdmin"><label>Admin key<input type="password" autoComplete="off" value={key} onChange={e=>setKey(e.target.value)} placeholder="CRM_TEMPLATE_ADMIN_KEY"/></label><small>Not stored in the browser. Server checks the key on every save.</small></div>
    {error&&<div className="errorBox" role="alert">{error}</div>}{notice&&<div className="tmplSuccess" role="status"><CheckCircle2 size={16}/>{notice}</div>}
    <button className="tmplSave" disabled={saving||!key||!draft.name.trim()||!draft.content.trim()} onClick={save}><Save size={17}/>{saving?"Saving…":"Save changes"}</button>
   </div>
  </>:<div className="emptyState">Choose a template to edit.</div>}</section></div>
 </div>
}
