"use client";
import {useEffect,useMemo,useState} from "react";
import {BookOpen,CheckCircle2,ChevronRight,ExternalLink,FlaskConical,PackageSearch,RefreshCw,Save,Search,ShieldCheck} from "lucide-react";
import {PageHeader} from "@/components/PageHeader";
type CatalogItem={woo_id:number;name:string;slug:string;image_url:string|null;price:string|null;currency:string;stock_status:string|null;research_status:string;approved_sources:number;last_synced_at:string};
type Source={id:string;title:string;url:string;snippet:string;query:string;source_type:"commercial"|"research";topic:string};
type Product=CatalogItem &{woo_data?:{agent_context?:Record<string,unknown>;images?:{url?:string}[]};benefits?:string;positioning?:string;ingredients?:string;usage?:string;faq?:string;notes?:string;safety_notes?:string;research_draft?:Source[];approved_research?:Source[]};
type EditKey="benefits"|"positioning"|"ingredients"|"usage"|"faq"|"notes"|"safety_notes";
const fields:{key:EditKey;label:string;placeholder:string}[]=[
{key:"benefits",label:"Benefits & main selling points",placeholder:"Key product benefits verified from label or supplier"},
{key:"positioning",label:"Sales positioning",placeholder:"Who this product is for, best-fit use cases, customer problems"},
{key:"ingredients",label:"Verified ingredients",placeholder:"Use only ingredients verified on this product's packaging"},
{key:"usage",label:"How to use",placeholder:"Directions confirmed by manufacturer; do not invent dosage"},
{key:"faq",label:"FAQ & objections",placeholder:"Q: ...\nA: ..."},
{key:"safety_notes",label:"Important precautions",placeholder:"Verified contraindications, age limits and interactions"},
{key:"notes",label:"Extra notes for sales agent",placeholder:"Brand story, comparisons, customer buying considerations"}];
const empty=Object.fromEntries(fields.map(f=>[f.key,""])) as Record<EditKey,string>;
export default function ProductsPage(){
 const [all,setAll]=useState<CatalogItem[]>([]);
 const [active,setActive]=useState<number|null>(null);
 const [detail,setDetail]=useState<Product|null>(null);
 const [form,setForm]=useState<Record<EditKey,string>>({...empty});
 const [filter,setFilter]=useState("");
 const [adminKey,setAdminKey]=useState("");
 const [topic,setTopic]=useState("");
 const [checked,setChecked]=useState<string[]>([]);
 const [loading,setLoading]=useState(true);
 const [busy,setBusy]=useState<""|"save"|"search"|"approve">("");
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const readOnly=process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY==="1";
 async function list(){const r=await fetch("/api/products",{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Products unavailable");setAll(j.products||[]);return j.products as CatalogItem[]}
 async function open(id:number){setActive(id);setError("");setNotice("");setDetail(null);setChecked([]);
  try{const r=await fetch("/api/products?id="+encodeURIComponent(id),{cache:"no-store"});const j=await r.json();if(!r.ok)throw Error(j.error||"Product unavailable");setDetail(j.product);setForm(Object.fromEntries(fields.map(f=>[f.key,String(j.product[f.key]||"")])) as Record<EditKey,string>);setTopic("");}catch(e){setError(e instanceof Error?e.message:"Unable to load product")}
 }
 useEffect(()=>{let cancelled=false;list().then(items=>{if(!cancelled&&items.length)void open(Number(items[0].woo_id));}).catch(e=>{if(!cancelled)setError(e.message)}).finally(()=>{if(!cancelled)setLoading(false)});return()=>{cancelled=true}},[]);
 const filtered=useMemo(()=>all.filter(p=>(p.name+" "+p.slug+" "+p.woo_id).toLowerCase().includes(filter.toLowerCase())),[all,filter]);
 const drafts=Array.isArray(detail?.research_draft)?detail.research_draft:[];
 const approved=Array.isArray(detail?.approved_research)?detail.approved_research:[];
 async function act(kind:"save"|"search"|"approve"){
  if(!detail)return;setBusy(kind);setNotice("");setError("");
  const url=kind==="save"?"/api/products":kind==="search"?"/api/products/research":"/api/products/approve";
  const method=kind==="save"?"PATCH":"POST";
  const body=kind==="save"?{woo_id:detail.woo_id,...form}:kind==="search"?{woo_id:detail.woo_id,topic:topic||"beneficios, usos, ingredientes"}:{woo_id:detail.woo_id,source_ids:checked};
  try{
   const r=await fetch(url,{method,headers:{"Content-Type":"application/json","x-template-admin-key":adminKey},body:JSON.stringify(body)});
   const j=await r.json();if(!r.ok)throw Error(j.error||"Operation failed");
   setNotice(kind==="save"?"Knowledge saved.":kind==="search"?"Google research collected as a draft. Review sources before approval.":"Selected sources approved for the WhatsApp knowledge base.");
   await Promise.all([list(),open(detail.woo_id)]);
  }catch(e){setError(e instanceof Error?e.message:"Request failed")}finally{setBusy("")}
 }
 return <div className="productHub">
  <PageHeader title="Product Knowledge" description="WooCommerce catalog · editorial knowledge · Serper research · WhatsApp sales agent"/>
  <div className="productHubStats"><div><strong>{all.length}</strong><span>WooCommerce products</span></div><div><strong>{all.filter(x=>x.research_status==="approved").length}</strong><span>Research approved</span></div><div><strong>{all.filter(x=>x.research_status==="draft").length}</strong><span>Waiting for review</span></div></div>
  <div className="productHubLayout">
   <aside className="productHubList">
    <div className="productHubListHead"><strong>Products</strong><button title="Refresh catalog view" type="button" onClick={()=>{void list().catch(e=>setError(e.message))}}><RefreshCw size={17}/></button></div>
    <label className="productHubSearch"><Search size={16}/><input aria-label="Find a product" placeholder="Search products..." value={filter} onChange={e=>setFilter(e.target.value)}/></label>
    {loading&&<p className="productHubEmpty">Loading WooCommerce catalog...</p>}
    {!loading&&!filtered.length&&<p className="productHubEmpty">No products found. WooCommerce sync may still be pending.</p>}
    {filtered.map(p=><button key={p.woo_id} type="button" onClick={()=>void open(Number(p.woo_id))} className={"productHubOption"+(active===Number(p.woo_id)?" chosen":"")}>
      {p.image_url?<img src={p.image_url} alt="" loading="lazy"/>:<span className="productHubImageEmpty"><PackageSearch size={20}/></span>}
      <span className="productHubOptionText"><strong>{p.name}</strong><small>#{p.woo_id} · {p.price?Number(p.price).toLocaleString("es-GT")+" "+p.currency:"Price unavailable"}</small></span>
      <ChevronRight size={16}/>
    </button>)}
   </aside>
   <section className="productHubMain">
    {!detail?<div className="productHubEmpty">Select a WooCommerce product to open its knowledge profile.</div>:<>
     <div className="productHubHero">
      {detail.image_url?<img src={detail.image_url} alt="" />:<PackageSearch size={40}/>}
      <div><small>WOOCOMMERCE #{detail.woo_id}</small><h2>{detail.name}</h2><p><strong>{detail.price||"—"} {detail.currency||"GTQ"}</strong> · {detail.stock_status||"Stock unavailable"} · <span className="productHubStatus">{detail.research_status||"not_started"}</span></p>
      {detail.product_url&&<a href={detail.product_url} target="_blank" rel="noreferrer">View store listing <ExternalLink size={13}/></a>}</div>
     </div>
     <div className="productHubNotice"><ShieldCheck size={17}/><span>WooCommerce pricing, stock and product listing are read-only here. Manual notes and approved research are stored separately.</span></div>
     <div className="productHubPanel">
      <h3><BookOpen size={18}/> Product knowledge editor</h3>
      <p>Write trusted information for your WhatsApp sales bot. These notes are not automatically added to WooCommerce.</p>
      <div className="productHubFields">{fields.map(f=><label key={f.key}><strong>{f.label}</strong><textarea rows={f.key==="faq"?4:3} maxLength={8000} value={form[f.key]||""} placeholder={f.placeholder} onChange={e=>setForm(v=>({...v,[f.key]:e.target.value}))}/></label>)}</div>
      <div className="productHubActions"><button disabled={!!busy||!adminKey||readOnly} onClick={()=>void act("save")} type="button"><Save size={16}/> {busy==="save"?"Saving...":"Save product knowledge"}</button></div>
     </div>
     <div className="productHubPanel">
       <h3><FlaskConical size={19}/> Google research via Serper</h3>
       <p>Searches for exact-product positioning and ingredient research. All findings stay as drafts until you approve them.</p>
       <div className="productHubResearchInput"><input value={topic} maxLength={85} onChange={e=>setTopic(e.target.value)} placeholder="Research topic: e.g. testosterona, ingredients, benefits"/><button type="button" disabled={!!busy||!adminKey||readOnly} onClick={()=>void act("search")}><Search size={16}/>{busy==="search"?"Researching...":"Research product"}</button></div>
       <div className="productHubResearchHead"><strong>Research draft ({drafts.length})</strong><small>Select sources to approve</small></div>
       {!drafts.length&&<p className="productHubEmpty">No Google research drafts yet. Use Research product to collect sources.</p>}
       <div className="productHubSources">{drafts.map(src=><label key={src.id} className="productHubSource"><input type="checkbox" checked={checked.includes(src.id)} onChange={e=>setChecked(old=>e.target.checked?[...old,src.id]:old.filter(id=>id!==src.id))}/><span><span className="productHubSourceType">{src.source_type==="research"?"Ingredient research":"Product / competitor website"}</span><strong>{src.title}</strong><small>{src.snippet}</small><a href={src.url} target="_blank" rel="noreferrer" onClick={e=>e.stopPropagation()}>Verify original source <ExternalLink size={12}/></a></span></label>)}</div>
       {drafts.length>0&&<div className="productHubActions"><button disabled={!!busy||!adminKey||!checked.length||readOnly} onClick={()=>void act("approve")} type="button"><CheckCircle2 size={16}/>{busy==="approve"?"Approving...":"Approve selected sources for bot"}</button></div>}
       <div className="productHubResearchHead"><strong>Approved sources ({approved.length})</strong><small>Available for sales knowledge</small></div>
       {!approved.length?<p className="productHubEmpty">No research approved yet.</p>:<div className="productHubSources">{approved.map(src=><div className="productHubSource" key={src.id}><CheckCircle2 size={17}/><span><strong>{src.title}</strong><small>{src.snippet}</small><a href={src.url} target="_blank" rel="noreferrer">Open source <ExternalLink size={12}/></a></span></div>)}</div>}
     </div>
     <div className="productHubPanel productHubAccess">
       <h3>Admin access</h3>
       <p>Use the CRM admin key to save knowledge, search Google and approve sources. It is never sent to Serper or WooCommerce.</p>
       <input type="password" autoComplete="off" placeholder="CRM_TEMPLATE_ADMIN_KEY" value={adminKey} onChange={e=>setAdminKey(e.target.value)}/>
       <small>Google research requires SERPER_API_KEY configured in Vercel Production.</small>
     </div>
    </>}
    {(error||notice)&&<div role="status" className={"productHubFeedback"+(error?" hasError":"")}>{error||notice}</div>}
   </section>
  </div>
 </div>;
}
