import { Network, ShieldCheck, TriangleAlert } from "lucide-react";
import type { CrmSnapshot } from "@/lib/types";

export function DataSourcePill({ data }: { data: CrmSnapshot | null }) {
  if (!data) return <span className="pill subtle">Connecting to n8n…</span>;
  return (
    <div className="sourceWrap">
      <span className="pill success">
        <Network size={14}/> Live n8n
      </span>
      <span className={data.contractOk ? "pill success" : "pill danger"}>
        {data.contractOk ? <ShieldCheck size={14}/> : <TriangleAlert size={14}/>} Contract {data.contractOk ? "OK" : "warning"}
      </span>
    </div>
  );
}
