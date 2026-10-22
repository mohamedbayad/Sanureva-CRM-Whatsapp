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
    if (name === "@/components/MessageStatusTicks") return { MessageStatusTicks: ({status}) => React.createElement("span",{"aria-label":String(status||"pending")}) };
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
  assert.match(src,/filter\(\(m\) =>\s*!isStatusOnlyRecord\(m\)/);
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


// Direct Woo order intake regression: synthetic-only, no DB/network access.
function loadDirectWooAdapter() {
  const js = ts.transpileModule(read("lib/direct-woo-orders.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const mod = { exports: {} };
  const resolver = (name) => {
    if (name === "@neondatabase/serverless") {
      return { neon: () => { throw new Error("Synthetic tests must not connect to Neon"); } };
    }
    return require(name);
  };
  new Function("require", "module", "exports", js)(resolver, mod, mod.exports);
  return mod.exports;
}

test("Direct Woo Neon overlay never duplicates an existing order or resets WhatsApp confirmations", () => {
  const { toCrmOrder, mergeDirectWooOrders } = loadDirectWooAdapter();
  const mirrored = toCrmOrder({
    order_id: "QA-ORDER-501",
    customer_name: "Fixture Updated",
    customer_city: "Mixco",
    grand_total: "189.00",
    woocommerce_status: "processing",
    whatsapp_status: null,
    delivery_status: null,
    reminders_sent: 0,
    source_record: { woocommerce_direct: true, product_summary: "Sample x1" },
  });
  assert.equal(mirrored["Order ID"], "QA-ORDER-501");
  assert.equal(mirrored["Final Total (MAD)"], "189.00");
  const existing = [{
    "Order ID": "QA-ORDER-501",
    "Customer Name": "Fixture Initial",
    "WhatsApp Status": "read",
    "Delivery Status": "delivered",
    "Confirmation Received": "2026-10-22T12:00:00Z",
    "Reminders Sent": 1,
  }];
  const merged = mergeDirectWooOrders(existing, [mirrored, mirrored]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]["Customer Name"], "Fixture Updated");
  assert.equal(merged[0]["WooCommerce Status"], "processing");
  assert.equal(merged[0]["WhatsApp Status"], "read");
  assert.equal(merged[0]["Delivery Status"], "delivered");
  assert.equal(merged[0]["Reminders Sent"], 1);
  assert.equal(merged[0]["Confirmation Received"], "2026-10-22T12:00:00Z");
});

test("Direct Woo order appears without existing Sheets row or WhatsApp send", () => {
  const { toCrmOrder, mergeDirectWooOrders } = loadDirectWooAdapter();
  const row = toCrmOrder({
    order_id: "QA-ORDER-NO-WA",
    customer_name: "Fixture No WhatsApp",
    grand_total: "179",
    woocommerce_status: "pending",
    source_record: { woocommerce_direct: true, product_summary: "New order" },
  });
  const merged = mergeDirectWooOrders([], [row]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]["Order ID"], "QA-ORDER-NO-WA");
  assert.equal(merged[0]["WooCommerce Status"], "pending");
  assert.equal(merged[0]["WhatsApp Status"], "");
  assert.equal(merged[0]["Confirmation Received"], "");
});

test("Neon mirror materializes direct Woo rows and retains Sheets fallback route", () => {
  const snapshot = read("lib/neon-snapshot.ts");
  const api = read("app/api/snapshot/route.ts");
  assert.match(snapshot, /orders:\s*orderToRecords\(orders\)/);
  assert.match(snapshot, /woocommerce_direct === true\s*\? toCrmOrder\(row\)/);
  assert.match(api, /getNeonRawSnapshot\(\)/);
  assert.match(api, /mergeDirectWooOrders\(/);
  assert.doesNotMatch(api, /send_message|queueWhatsAppMessage|\.POST\(/);
});

function loadSnapshotSingleflight() {
  const js = ts.transpileModule(read("lib/snapshot-singleflight.ts"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
  }).outputText;
  const mod = { exports: {} };
  new Function("require", "module", "exports", js)(require, mod, mod.exports);
  return mod.exports.createSnapshotSingleflight;
}

test("Snapshot singleflight coalesces concurrent reads and expires after 10 seconds", async () => {
  const create = loadSnapshotSingleflight();
  let now = 1000;
  let calls = 0;
  let resolveFirst;
  const gate = new Promise((resolve) => { resolveFirst = resolve; });
  const cached = create(10000, () => now);
  const load = async () => { calls++; await gate; return { version: calls }; };
  const first = cached.get(load);
  const second = cached.get(load);
  await Promise.resolve();
  assert.equal(calls, 1);
  resolveFirst();
  const results = await Promise.all([first, second]);
  assert.deepEqual(results, [{version: 1}, {version: 1}]);
  const third = await cached.get(load);
  assert.equal(calls, 1);
  assert.deepEqual(third, {version: 1});
  now = 11000; // 10s later, cached value must expire.
  const fourth = await cached.get(load);
  assert.equal(calls, 2);
  assert.deepEqual(fourth, {version: 2});
});

test("Snapshot singleflight never caches rejected loads and permits immediate retry", async () => {
  const create = loadSnapshotSingleflight();
  let calls = 0;
  const cached = create(10000, () => 1000);
  await assert.rejects(
    cached.get(async () => { calls++; throw new Error("simulated Sheets 429"); }),
    /simulated Sheets 429/
  );
  assert.equal(calls, 1);
  const fixed = await cached.get(async () => { calls++; return { recovered: true }; });
  assert.deepEqual(fixed, { recovered: true });
  assert.equal(calls, 2);
  const reused = await cached.get(async () => { calls++; throw new Error("should not call"); });
  assert.deepEqual(reused, fixed);
  assert.equal(calls, 2);
});

test("Snapshot singleflight uses shorter fallback TTL and respects zero/invalid TTL", async () => {
  const create = loadSnapshotSingleflight();
  let now = 0, calls = 0;
  const cache = create(10000, () => now);
  const fallback = () => cache.get(async () => ({ version: ++calls }), () => 2000);
  assert.deepEqual(await fallback(), { version: 1 });
  now = 1999;
  assert.deepEqual(await fallback(), { version: 1 });
  now = 2000;
  assert.deepEqual(await fallback(), { version: 2 });
  const noCache = create(10000, () => now);
  let fresh = 0;
  await noCache.get(async () => ++fresh, () => Number.NaN);
  await noCache.get(async () => ++fresh, () => Number.NaN);
  assert.equal(fresh, 2);
});

test("CRM snapshot deduplication never disables session auth or WhatsApp no-send guard", () => {
  const route = read("app/api/snapshot/route.ts");
  const proxy = read("proxy.ts");
  const outbox = read("app/api/outbox/route.ts");
  assert.match(route, /createSnapshotSingleflight<CrmSnapshot>\(10000\)/);
  assert.match(route, /snapshotReads\.get\(readSnapshotSafely/);
  assert.match(route, /Gateway temporarily unavailable/);
  assert.match(proxy, /verifyCrmSession\(/);
  assert.match(outbox, /CRM_READ_SOURCE|VERCEL_ENV/);
  assert.doesNotMatch(route, /send_message|queueWhatsAppMessage/);
});
