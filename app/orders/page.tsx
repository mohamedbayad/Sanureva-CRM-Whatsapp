"use client";

import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useCrm } from "@/components/use-crm";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { StatusBadge } from "@/components/StatusBadge";
import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay, formatDate, money, textIncludes } from "@/lib/format";

export default function OrdersPage() {
  const { data, loading, error, refresh } = useCrm();
  const [q, setQ] = useState("");
  const rows = data?.sheets[SHEET_NAMES.orders] || [];
  const filtered = useMemo(() => rows.filter((r) => !q || ["Order ID","Customer Name","Phone Number","City","Items / Products","WooCommerce Status","WhatsApp Status"].some((k) => textIncludes(r[k], q))), [rows, q]);
  if (loading && !data) return <Loading/>;
  return <>
    <PageHeader title="Orders" subtitle="Orders served through n8n, with the existing order automation logic left unchanged." data={data} refresh={refresh}/>
    {error && <div className="warningBox">{error}</div>}
    <section className="panel"><div className="toolbar"><div className="search"><Search size={16}/><input value={q} onChange={(e)=>setQ(e.target.value)} placeholder="Search order, customer, phone, city…"/></div><span className="count">{filtered.length} orders</span></div>
      <div className="tableWrap"><table className="wide"><thead><tr><th>Order</th><th>Customer</th><th>Phone</th><th>Products</th><th>Total</th><th>WooCommerce</th><th>WhatsApp</th><th>Delivery</th><th>Created</th></tr></thead><tbody>
        {filtered.map((o, i)=><tr key={`${cleanDisplay(o["Order ID"])}-${i}`}><td><strong>#{cleanDisplay(o["Order ID"]) || "—"}</strong><small>{cleanDisplay(o["City"]) || "—"}</small></td><td>{cleanDisplay(o["Customer Name"]) || "—"}</td><td className="mono">{cleanDisplay(o["Phone Number"]) || "—"}</td><td className="productCell">{cleanDisplay(o["Items / Products"]) || "—"}</td><td>{money(o["Final Total (MAD)"] || o["Order Value (MAD)"])}</td><td><StatusBadge value={o["WooCommerce Status"]}/></td><td><StatusBadge value={o["WhatsApp Status"]}/></td><td><StatusBadge value={o["Delivery Status"]}/></td><td>{formatDate(o["Date & Time"])}</td></tr>)}
      </tbody></table></div>
    </section>
  </>;
}
