import { Network, ShieldCheck, TriangleAlert } from "lucide-react";
import type { CrmSnapshot } from "@/lib/types";

export function DataSourcePill({ data }: { data: CrmSnapshot | null }) {
  if (!data) return <span className="pill subtle">Loading CRM data…</span>;
  return (
    <div className="sourceWrap">
      <span className="pill success">
        <Network size={14}/> {data.source === "neon" ? (process.env.NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1" ? "Neon Preview · read only" : "Neon DB · WhatsApp via n8n") : "Live n8n"}
      </span>
      <span className={data.contractOk ? "pill success" : "pill danger"}>
        {data.contractOk ? <ShieldCheck size={14}/> : <TriangleAlert size={14}/>} Contract {data.contractOk ? "OK" : "warning"}
      </span>
    </div>
  );
}
