// Acceptance route and report invariants; no live CRM accounts or customer data.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const source = p => readFileSync(resolve(root,p),"utf8");
const page = source("app/acceptance-review/page.tsx");
const client = source("components/AcceptanceReviewClient.tsx");
const sidebar = source("components/Sidebar.tsx");
const api = source("app/api/neon-page-qa/route.ts");

test("acceptance route fails closed outside protected direct Neon Preview", () => {
  assert.match(page,/VERCEL_ENV !== "preview"/);
  assert.match(page,/CRM_READ_SOURCE !== "neon_shadow"/);
  assert.match(page,/CRM_PREVIEW_DIRECT_READ !== "1"/);
  assert.match(page,/notFound\(\)/);
  assert.match(page,/robots:\s*\{ index: false, follow: false \}/);
});

test("acceptance page queries only protected read-only GET endpoints", () => {
  assert.match(client,/fetch\("\/api\/neon-page-qa"/);
  assert.match(client,/fetch\("\/api\/snapshot"/);
  assert.match(client,/credentials: "same-origin"/);
  assert.doesNotMatch(client,/fetch\("\/api\/outbox"/);
  assert.doesNotMatch(client,/(?:method|action):\s*["'](?:POST|DELETE|PUT|PATCH)/);
  assert.match(api,/writes_enabled:\s*false/);
  assert.match(api,/count.*orders|orders\.length/);
});

test("inbox and orders checks use exact IDs and exclude status-only callbacks", () => {
  assert.match(client,/new Set\(ids\)\.size/);
  assert.match(client,/known\.has\(cleanDisplay\(m\["Conversation ID"\]\)\)/);
  assert.match(client,/messages\.filter\(isStatusOnlyRecord\)/);
  assert.match(client,/computeMetrics\(snapshot\)/);
  assert.match(client,/qa\.counts\.messages === messages\.length/);
  assert.match(client,/qa\.checks\.orders/);
  assert.match(client,/qa\.checks\.inbox/);
});

test("manual acceptance requires checking actual Inbox, Orders and Dashboard", () => {
  for (const path of ["/inbox","/orders","/"]) assert.ok(client.includes('href: "'+path+'"'));
  assert.match(client,/manualComplete = Object\.values\(manual\)\.every\(Boolean\)/);
  assert.match(client,/overall_acceptance: automaticPass && manualComplete/);
  assert.match(client,/I verified /);
});

test("copyable report includes only aggregate counters and booleans", () => {
  const snippet = client.split("function safeReport() {")[1]?.split("async function copyReport()")[0] || "";
  assert.ok(snippet);
  assert.match(snippet,/includes_customer_data: false/);
  assert.doesNotMatch(snippet,/customer_phone|customer_name|order_id|message_text|media_url|wa_id|signed_url|\.sheets/i);
  assert.match(snippet,/manual_orders_confirmed/);
});

test("non-200 data-quality responses show diagnostic checks rather than hiding them", () => {
  assert.match(client, /pageRes\.status !== 409/);
  assert.match(client, /setReport\(inspectSnapshot\(snapshot, qa\)\)/);
  assert.match(client, /CHECK — one or more data checks failed/);
});

test("mobile, disabled sending and unauthenticated security require manual acceptance", () => {
  assert.match(client, /key: "mobile"/);
  assert.match(client, /key: "read_only"/);
  assert.match(client, /manual_mobile_confirmed: manual\.mobile/);
  assert.match(client, /manual_read_only_security_confirmed: manual\.read_only/);
  assert.match(client, /unsigned-in request to \/api\/snapshot does not expose data/);
});

test("sidebar only exposes acceptance page for read-only Preview", () => {
  assert.match(sidebar,/NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1" \? \[\{ href: "\/acceptance-review"/);
});
