"use client";

import { useCrm } from "@/components/use-crm";
import { PageHeader } from "@/components/PageHeader";
import { Loading } from "@/components/Loading";
import { StatusBadge } from "@/components/StatusBadge";
import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay, formatDate } from "@/lib/format";
import { latestRows } from "@/lib/metrics";

export default function EventsPage(){
  const {data,loading,error,refresh}=useCrm();
  if(loading&&!data)return <Loading/>;
  const events=data?latestRows(data.sheets[SHEET_NAMES.events],"Timestamp",100):[];
  const health=data?.sheets[SHEET_NAMES.workflowHealth]||[];
  return <><PageHeader title="Events & Workflow Health" subtitle="Confirmation audit and workflow telemetry served through n8n without changing the existing automations." data={data} refresh={refresh}/>{error&&<div className="warningBox">{error}</div>}
    <div className="twoCol eventsCols"><section className="panel"><div className="panelHeader"><div><h2>Confirmation events</h2><p>CONFIRMATION_EVENTS</p></div></div><div className="timeline">{events.map((e,i)=><div className="timelineItem" key={`${cleanDisplay(e["Event ID"])}-${i}`}><div className="timelineDot"/><div><strong>{cleanDisplay(e["Event Type"])||"Event"}</strong><span>Order #{cleanDisplay(e["Order ID"])||"—"} · {cleanDisplay(e["Trigger Source"])}</span><small>{formatDate(e["Timestamp"])}</small></div><StatusBadge value={e["Result Status"]}/></div>)}</div></section>
    <section className="panel"><div className="panelHeader"><div><h2>Workflow telemetry</h2><p>WORKFLOW_HEALTH raw rows</p></div></div>{health.length?<div className="tableWrap"><table><thead><tr><th>Workflow</th><th>Status</th><th>Duration</th><th>Timestamp</th></tr></thead><tbody>{health.map((h,i)=><tr key={i}><td>{cleanDisplay(h["Workflow Name"])||"—"}</td><td><StatusBadge value={h["Execution Status"]}/></td><td>{cleanDisplay(h["Execution Time (ms)"])||"—"}</td><td>{formatDate(h["Timestamp"])}</td></tr>)}</tbody></table></div>:<div className="emptyState">No execution rows currently logged in WORKFLOW_HEALTH.</div>}</section></div>
  </>;
}
