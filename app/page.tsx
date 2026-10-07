"use client";

import { Activity, CircleCheckBig, Clock3, MessageCircleMore, PackageCheck, ShoppingCart, TrendingUp, WalletCards } from "lucide-react";
import { useCrm } from "@/components/use-crm";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { StatusBadge } from "@/components/StatusBadge";
import { computeMetrics, latestRows } from "@/lib/metrics";
import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay, formatDate, money } from "@/lib/format";

export default function DashboardPage() {
  const { data, loading, error, refresh } = useCrm();
  if (loading && !data) return <Loading/>;
  if (!data) return <div className="errorBox">{error || "No CRM data"}</div>;
  const m = computeMetrics(data);
  const latestOrders = latestRows(data.sheets[SHEET_NAMES.orders], "Date & Time", 6);
  const latestEvents = latestRows(data.sheets[SHEET_NAMES.events], "Timestamp", 6);
  const cards = [
    ["Orders", m.orders, ShoppingCart, `${m.confirmed} confirmed`],
    ["Confirmation rate", `${(m.confirmationRate * 100).toFixed(1)}%`, CircleCheckBig, "WhatsApp confirmation"],
    ["Gross revenue", money(m.grossRevenue), WalletCards, `${money(m.confirmedRevenue)} confirmed`],
    ["Avg. order", money(m.avgOrder), TrendingUp, "Across logged orders"],
    ["Conversations", m.conversations, MessageCircleMore, `${m.messages} messages`],
    ["Avg. response", `${m.avgResponse.toFixed(1)} min`, Clock3, `${m.reminders} reminders`],
    ["Delivered/read", m.delivered, PackageCheck, `${m.failed} failed`],
    ["Outbox queue", m.pendingOutbox, Activity, "n8n sends every minute"],
  ] as const;

  return <>
    <PageHeader title="Operations Dashboard" subtitle="Live operations view served directly by the Sanureva n8n CRM Gateway." data={data} refresh={refresh}/>
    {error && <div className="warningBox">Last sync warning: {error}</div>}
    {!data.contractOk && <div className="warningBox"><strong>Sheet contract warning:</strong> {data.contractWarnings.join(" • ")}</div>}
    <section className="metricGrid">{cards.map(([label, value, Icon, sub]) => <div className="metricCard" key={label}><div className="metricIcon"><Icon size={19}/></div><div><span>{label}</span><strong>{value}</strong><small>{sub}</small></div></div>)}</section>

    <div className="twoCol">
      <section className="panel"><div className="panelHeader"><div><h2>Latest orders</h2><p>Read-only here; n8n remains responsible for order workflow writes.</p></div></div>
        <div className="tableWrap"><table><thead><tr><th>Order</th><th>Customer</th><th>Total</th><th>WhatsApp</th><th>Created</th></tr></thead><tbody>
          {latestOrders.map((o, i) => <tr key={`${cleanDisplay(o["Order ID"])}-${i}`}><td><strong>#{cleanDisplay(o["Order ID"])}</strong><small>{cleanDisplay(o["City"]) || "—"}</small></td><td>{cleanDisplay(o["Customer Name"]) || "—"}</td><td>{money(o["Final Total (MAD)"] || o["Order Value (MAD)"])}</td><td><StatusBadge value={o["WhatsApp Status"]}/></td><td>{formatDate(o["Date & Time"])}</td></tr>)}
        </tbody></table></div>
      </section>
      <section className="panel"><div className="panelHeader"><div><h2>Confirmation timeline</h2><p>Latest events written by the active n8n flows.</p></div></div>
        <div className="timeline">{latestEvents.map((e, i) => <div className="timelineItem" key={`${cleanDisplay(e["Event ID"])}-${i}`}><div className="timelineDot"/><div><strong>{cleanDisplay(e["Event Type"]) || "Event"}</strong><span>Order #{cleanDisplay(e["Order ID"]) || "—"} · {cleanDisplay(e["Trigger Source"])}</span><small>{formatDate(e["Timestamp"])}</small></div><StatusBadge value={e["Result Status"]}/></div>)}</div>
      </section>
    </div>
  </>;
}
