"use client";

import { RefreshCw } from "lucide-react";
import { DataSourcePill } from "@/components/DataSourcePill";
import type { CrmSnapshot } from "@/lib/types";

export function PageHeader({ title, subtitle, data, refresh, busy = false }: { title: string; subtitle: string; data: CrmSnapshot | null; refresh?: () => void; busy?: boolean }) {
  return (
    <header className="pageHeader">
      <div><h1>{title}</h1><p>{subtitle}</p></div>
      <div className="headerActions">
        <DataSourcePill data={data}/>
        {refresh && <button className="iconButton" onClick={refresh} aria-label="Refresh"><RefreshCw size={17} className={busy ? "spin" : ""}/></button>}
      </div>
    </header>
  );
}
