"use client";

import { useState } from "react";
import { SHEET_NAMES } from "@/lib/contracts";
import { computeMetrics } from "@/lib/metrics";
import { isStatusOnlyRecord } from "@/lib/status-records";
import { cleanDisplay } from "@/lib/format";
import type { CrmSnapshot } from "@/lib/types";

type PageQa = {
  ok: boolean;
  source: string;
  mode: string;
  writes_enabled: boolean;
  counts: { orders: number; conversations: number; messages: number };
  checks: { dashboard: boolean; inbox: boolean; orders: boolean;
    contract_ok: boolean; unlinked_messages: number;
    duplicate_order_ids: number; leaked_delivery_status_only_rows: number };
};
type Report = {
  source_neon: boolean; contract_ok: boolean;
  orders_unique: boolean; messages_linked: boolean;
  callbacks_excluded: boolean; metrics_valid: boolean;
  no_page_qa_writes: boolean; summary_counts_consistent: boolean;
  orders: number; conversations: number; messages: number;
  unlinked: number; duplicate_orders: number; status_callbacks_visible: number;
};
const style: React.CSSProperties = {
  border: "1px solid var(--line)", padding: 20, borderRadius: 14,
  background: "var(--panel)", display: "grid", gap: 11,
};
const muted: React.CSSProperties = { color: "var(--muted)", fontSize: 13 };
const button: React.CSSProperties = {
  padding: "10px 15px", background: "white", border: "1px solid var(--line)",
  borderRadius: 9, cursor: "pointer",
};

function inspectSnapshot(snapshot: CrmSnapshot, qa: PageQa): Report {
  const orders = snapshot.sheets[SHEET_NAMES.orders] || [];
  const conversations = snapshot.sheets[SHEET_NAMES.conversations] || [];
  const messages = snapshot.sheets[SHEET_NAMES.messages] || [];
  const known = new Set(conversations.map(c => cleanDisplay(c["Conversation ID"])).filter(Boolean));
  const ids = orders.map(o => cleanDisplay(o["Order ID"]));
  const duplicateOrders = ids.length - new Set(ids).size;
  const unlinked = messages.filter(m => !known.has(cleanDisplay(m["Conversation ID"]))).length;
  const visibleCallbacks = messages.filter(isStatusOnlyRecord).length;
  const metrics = computeMetrics(snapshot);
  const validMetrics = [metrics.grossRevenue, metrics.avgOrder, metrics.confirmationRate, metrics.avgResponse]
    .every(Number.isFinite) &&
    metrics.orders === orders.length && metrics.conversations === conversations.length;
  return {
    source_neon: snapshot.source === "neon" && qa.source === "neon",
    contract_ok: snapshot.contractOk && qa.checks.contract_ok === true,
    orders_unique: orders.length > 0 && !ids.includes("") && duplicateOrders === 0 && qa.checks.orders,
    messages_linked: unlinked === 0 && messages.length > 0 && conversations.length > 0 && qa.checks.inbox,
    callbacks_excluded: visibleCallbacks === 0 && qa.checks.leaked_delivery_status_only_rows === 0,
    metrics_valid: validMetrics && qa.checks.dashboard,
    no_page_qa_writes: qa.writes_enabled === false,
    summary_counts_consistent:
      qa.counts.orders === orders.length &&
      qa.counts.conversations === conversations.length &&
      qa.counts.messages === messages.length,
    orders: orders.length, conversations: conversations.length, messages: messages.length,
    unlinked, duplicate_orders: duplicateOrders, status_callbacks_visible: visibleCallbacks,
  };
}

const manualLabels = [
  { key: "inbox", title: "Inbox", href: "/inbox",
    text: "Real conversations display correctly, image/audio stay as original media, and there is no Queue/Send composer." },
  { key: "orders", title: "Orders", href: "/orders",
    text: "Order records show correct WooCommerce/WhatsApp statuses and no edit actions." },
  { key: "dashboard", title: "Dashboard", href: "/",
    text: "Order/conversation/message counts and KPI cards load without errors." },
  { key: "mobile", title: "Mobile Inbox", href: "/inbox",
    text: "At narrow/mobile width, I can navigate chats, read messages, see images and play voice notes without overlap or clipping." },
  { key: "read_only", title: "Read-only security", href: "/inbox",
    text: "Inbox has no Send/Queue composer; Orders has no edit controls. In a private/incognito window, an unsigned-in request to /api/snapshot does not expose data." },
] as const;
type ManualKey = typeof manualLabels[number]["key"];

export function AcceptanceReviewClient() {
  const [report, setReport] = useState<Report | null>(null);
  const [manual, setManual] = useState<Record<ManualKey, boolean>>({
    inbox: false, orders: false, dashboard: false, mobile: false, read_only: false,
  });
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);

  async function run() {
    if (running) return;
    setRunning(true); setError(""); setCopied(false); setReport(null);
    try {
      const [pageRes, snapshotRes] = await Promise.all([
        fetch("/api/neon-page-qa", { credentials: "same-origin", cache: "no-store" }),
        fetch("/api/snapshot", { credentials: "same-origin", cache: "no-store" }),
      ]);
      if (!pageRes.ok || !snapshotRes.ok) {
        if (pageRes.status !== 409 || !snapshotRes.ok) {
          throw new Error(
            pageRes.status === 401 || snapshotRes.status === 401
              ? "Sign in to CRM before checking Inbox and Orders."
              : "Preview snapshot or page QA is not available."
          );
        }
      }
      const qa = await pageRes.json() as PageQa;
      const snapshot = await snapshotRes.json() as CrmSnapshot;
      setReport(inspectSnapshot(snapshot, qa));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read CRM Preview.");
    } finally {
      setRunning(false);
    }
  }
  const automaticPass = report !== null && [
    report.source_neon, report.contract_ok, report.orders_unique, report.messages_linked,
    report.callbacks_excluded, report.metrics_valid, report.no_page_qa_writes,
    report.summary_counts_consistent
  ].every(Boolean);
  const manualComplete = Object.values(manual).every(Boolean);
  function safeReport() {
    return JSON.stringify({
      test: "sanureva-preview-inbox-orders-acceptance",
      includes_customer_data: false,
      automated_pass: automaticPass,
      ...report,
      manual_inbox_confirmed: manual.inbox,
      manual_orders_confirmed: manual.orders,
      manual_dashboard_confirmed: manual.dashboard,
      manual_mobile_confirmed: manual.mobile,
      manual_read_only_security_confirmed: manual.read_only,
      overall_acceptance: automaticPass && manualComplete,
    }, null, 2);
  }
  async function copyReport() {
    try { await navigator.clipboard.writeText(safeReport()); setCopied(true); }
    catch { setError("Browser clipboard unavailable."); }
  }

  return <div style={{display: "grid", gap: 18, maxWidth: 1080}}>
    <div className="pageHeader"><div>
      <h1>Inbox &amp; Orders · Acceptance QA</h1>
      <p>Protected Neon Preview only. Read-only checks; no WhatsApp sends, order changes or database writes.</p>
    </div></div>
    <section style={style}>
      <strong>1. Run live aggregate checks</strong>
      <p style={muted}>Reads the same signed-in CRM snapshot used by Inbox, Orders and Dashboard.
        No customer names, phone numbers, messages or media URLs are included in the report.</p>
      <div><button style={button} disabled={running} onClick={run}>
        {running ? "Checking…" : "Run Inbox & Orders QA"}
      </button></div>
      {error && <p className="warningBox" role="alert">{error}</p>}
      {report && <>
        <strong role="status">{automaticPass ? "PASS — aggregate data checks" : "CHECK — one or more data checks failed"}</strong>
        <div style={{display: "flex", gap: 14, flexWrap: "wrap"}}>
          <span>Conversations: <strong>{report.conversations}</strong></span>
          <span>Messages: <strong>{report.messages}</strong></span>
          <span>Orders: <strong>{report.orders}</strong></span>
        </div>
        <div style={{display: "grid", gap: 5, fontSize: 13}}>
          {([
            ["Neon source", report.source_neon],
            ["Snapshot contract", report.contract_ok],
            ["Unique orders", report.orders_unique],
            ["No orphaned messages", report.messages_linked],
            ["Callbacks excluded from chat", report.callbacks_excluded],
            ["Dashboard KPIs finite", report.metrics_valid],
            ["Page QA read-only", report.no_page_qa_writes],
            ["Aggregate counts consistent", report.summary_counts_consistent],
          ] as [string,boolean][]).map(([label,valid])=>
            <div key={label}><strong>{valid ? "✓ PASS" : "✕ CHECK"}</strong> — {label}</div>
          )}
        </div>
      </>}
    </section>

    <section style={style}>
      <strong>2. Verify actual pages (human acceptance)</strong>
      <p style={muted}>Automated checks do not prove how Inbox, Orders and Dashboard look inside your browser.
        Open each page, inspect the real display, then check the corresponding box.</p>
      {manualLabels.map(item => <div key={item.key}
        style={{display: "grid", gap: 5, paddingBottom: 10, borderBottom: "1px solid var(--line)"}}>
        <div><a href={item.href} target="_blank" rel="noopener noreferrer">
          Open {item.title} ↗</a></div>
        <label style={{display:"flex", gap:10, alignItems:"flex-start", fontSize:14}}>
          <input type="checkbox" checked={manual[item.key]} onChange={e =>
            setManual(current => ({ ...current, [item.key]: e.target.checked }))
          } aria-label={"I verified " + item.title}/>
          <span>{item.text}</span>
        </label>
      </div>)}
    </section>

    <section style={style}>
      <strong>3. Safe acceptance report</strong>
      <p style={muted}>This JSON contains only aggregate counts and PASS/CHECK flags; it excludes customer records,
        order IDs, messages, signed media URLs and private tokens.</p>
      {report ? <>
        <pre style={{overflowX:"auto",padding:12,borderRadius:8,background:"var(--panel-soft)",fontSize:11}}>
          {safeReport()}
        </pre>
        <button onClick={copyReport} style={button}>Copy safe QA report</button>
        {copied && <p style={muted} role="status">Copied. Share this report only, not customer screenshots.</p>}
      </> : <p style={muted}>Run the aggregate checks to generate a report.</p>}
      <p style={muted}>Passing this page is acceptance evidence only. It does not trigger GitHub merges,
        Vercel releases or automatic archiving.</p>
    </section>
  </div>;
}
