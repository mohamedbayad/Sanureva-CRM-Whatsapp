// Synthetic Inbox and Orders acceptance: renders the ACTUAL TSX components.
// Fake message/order records only; no n8n sends, external network, or customer data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const require = createRequire(import.meta.url);
const read = (path) => readFileSync(resolve(root, path), "utf8");
const SHEET_NAMES = {
  orders: "ORDERS", conversations: "CONVERSATIONS", messages: "MESSAGES",
  events: "CONFIRMATION_EVENTS", workflowHealth: "WORKFLOW_HEALTH", outbox: "WHATSAPP_OUTBOX",
};
const format = {
  cleanDisplay: (v) => v === null || v === undefined ? "" : String(v).trim(),
  normalizePhone: (v) => String(v || "").replace(/\D/g, ""),
  dateValue: (v) => Number.isFinite(Date.parse(String(v))) ? Date.parse(String(v)) : 0,
  formatDate: (v) => v ? String(v) : "—",
  textIncludes: (haystack, needle) => String(haystack || "").toLowerCase().includes(needle.toLowerCase()),
  money: (v) => "Q " + Number(v || 0).toFixed(2),
};
const fixture = {
  contractOk: true, contractWarnings: [], source: "neon", syncedAt: "2026-10-10T12:00:00Z",
  sheets: {
    [SHEET_NAMES.orders]: [
      {"Order ID":"TEST-ORDER-A","Date & Time":"2026-09-01T00:00:00Z","Customer Name":"Fixture A","Phone Number":"0000000000","City":"Fixture City","Items / Products":"Synthetic Item","WooCommerce Status":"processing","WhatsApp Status":"confirmed","Delivery Status":"pending","Final Total (MAD)":"159"},
      {"Order ID":"TEST-ORDER-B","Date & Time":"2026-09-02T00:00:00Z","Customer Name":"Fixture B","Phone Number":"0000000001","City":"Fixture City","Items / Products":"Synthetic Item","WooCommerce Status":"on-hold","WhatsApp Status":"pending","Delivery Status":"pending","Final Total (MAD)":"219"}
    ],
    [SHEET_NAMES.conversations]: [
      {"Conversation ID":"TEST-CONV-A","Customer Name":"Fixture A","Customer Phone":"0000000000","Started At":"2026-09-01T00:00:00Z","Order ID":"TEST-ORDER-A","Intent / Topic":"Synthetic"},
    ],
    [SHEET_NAMES.messages]: [
      {"Message ID":"TEST-MSG-A","Conversation ID":"TEST-CONV-A","Timestamp":"2026-09-01T00:00:00Z","Direction":"Inbound","Message Type":"Text Message","Message Content Snippet":"Hello from synthetic QA"},
      {"Message ID":"TEST-MSG-B","Conversation ID":"TEST-CONV-A","Timestamp":"2026-09-01T00:01:00Z","Direction":"Inbound","Message Type":"Voice Note","Media Kind":"audio","Media URL":"/api/media?synthetic=true","Message Content Snippet":"🎤 Nota de voz"},
    ],
    [SHEET_NAMES.events]: [], [SHEET_NAMES.workflowHealth]: [], [SHEET_NAMES.outbox]: [],
  },
};
function loadComponent(path) {
  const js = ts.transpileModule(read(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX }
  }).outputText;
  const mod = { exports: {} };
  const resolver = (name) => {
    if (name === "@/components/use-crm") return { useCrm: () => ({ data:fixture, loading:false, error:"", refresh:()=>{} }) };
    if (name === "@/components/PageHeader") return { PageHeader: ({title,subtitle}) => React.createElement("header",null,title," — ",subtitle) };
    if (name === "@/components/Loading") return { Loading: () => React.createElement("p",null,"Loading") };
    if (name === "@/components/MediaBubble") return { MediaBubble: ({message}) => React.createElement("p",null,format.cleanDisplay(message["Message Content Snippet"])), chatPreview: (m) => m ? format.cleanDisplay(m["Media Kind"]) || format.cleanDisplay(m["Message Content Snippet"]) : "" };
    if (name === "@/components/StatusBadge") return { StatusBadge: ({value}) => React.createElement("span",null,String(value||"")) };
    if (name === "@/lib/contracts") return { SHEET_NAMES };
    if (name === "@/lib/format") return format;
    if (name === "lucide-react") return new Proxy({}, { get:() => () => React.createElement("svg",{"aria-hidden":true}) });
    return require(name);
  };
  new Function("require", "module", "exports", "process", js)(
    resolver, mod, mod.exports, {env:{NEXT_PUBLIC_CRM_PREVIEW_READONLY:"1"}}
  );
  return mod.exports.default;
}
test("Real Inbox TSX renders messages but no WhatsApp composer in read-only Preview", () => {
  const Page = loadComponent("app/inbox/page.tsx");
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /WhatsApp Inbox/);
  assert.match(html, /Hello from synthetic QA/);
  assert.match(html, /Nota de voz/);
  assert.match(html, /Read-only preview/);
  assert.doesNotMatch(html, /<textarea\b/);
  assert.doesNotMatch(html, /Send through n8n/);
  assert.doesNotMatch(html, /Queueing/);
});
test("Real Orders TSX renders unique orders and WooCommerce status without editing", () => {
  const Page = loadComponent("app/orders/page.tsx");
  const html = renderToStaticMarkup(React.createElement(Page));
  assert.match(html, /2 orders/);
  assert.equal((html.match(/TEST-ORDER-A/g)||[]).length,1);
  assert.equal((html.match(/TEST-ORDER-B/g)||[]).length,1);
  assert.match(html, /processing/);
  assert.match(html, /confirmed/);
  assert.match(html, /Read-only Neon preview/);
  assert.doesNotMatch(html, /<button[^>]*>(?:Save|Update|Confirm|Delete)/i);
  assert.doesNotMatch(html, /<form\b/);
});
test("Real POST /api/outbox handler blocks read-only Preview before n8n queueing", async () => {
  const js = ts.transpileModule(read("app/api/outbox/route.ts"), {
    compilerOptions: {module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}
  }).outputText;
  let sent = 0;
  const mod = { exports:{} };
  const fakeRequire = (name) => {
    if (name === "next/server") return {NextResponse:{json:(body,{status=200}={})=>new Response(JSON.stringify(body),{status,headers:{"content-type":"application/json"}})}};
    if (name === "@/lib/n8n") return {queueWhatsAppMessage:async()=>{sent++;return {requestId:"impossible"};}};
    return require(name);
  };
  new Function("require","module","exports","process","Response",js)(
    fakeRequire,mod,mod.exports,{env:{VERCEL_ENV:"preview",CRM_READ_SOURCE:"neon_shadow"}},Response
  );
  const r=await mod.exports.POST({json:async()=>({phone:"00000000",type:"Text",message:"DO NOT SEND QA"})});
  assert.equal(r.status,403);
  assert.match(await r.text(),/sending is disabled in read-only Neon Preview/);
  assert.equal(sent,0);
});
test("Orders and Inbox are GET-only in Preview's page code", () => {
  const orders=read("app/orders/page.tsx"), inbox=read("app/inbox/page.tsx");
  assert.doesNotMatch(orders,/fetch\([^)]*method\s*:\s*["'](?:POST|PUT|PATCH|DELETE)/);
  assert.match(inbox,/if \(previewReadonly \|\| !active \|\| !phone\) return/);
  assert.match(inbox,/\{previewReadonly \? \(/);
});
test("Statuses are filtered from snapshots before appearing in chat threads", () => {
  const src=read("lib/n8n.ts");
  const model=read("lib/status-records.ts");
  assert.match(src,/filter\(\(m\) => !isStatusOnlyRecord\(m\)\)/);
  assert.match(model,/DELIVERY_STATUSES/);
  assert.match(model,/!get\("Message ID"\)/);
  assert.match(model,/!get\("Conversation ID"\)/);
});
test("All non-exempt API and Pages require CRM session in proxy", () => {
  const proxy=read("proxy.ts");
  assert.match(proxy,/verifyCrmSession\(/);
  assert.match(proxy,/if \(!isReady \|\| !signedIn\)/);
  assert.match(proxy,/pathname\.startsWith\("\/api\/"\)/);
  assert.match(proxy,/status: isReady \? 401 : 503/);
  assert.doesNotMatch(proxy,/pathname === "\/api\/outbox"\s*\|\|/);
});
