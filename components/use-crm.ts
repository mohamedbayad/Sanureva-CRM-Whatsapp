"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { CrmSnapshot } from "@/lib/types";

const POLL_MS = Number(process.env.NEXT_PUBLIC_CRM_POLL_MS || 30000);

export function useCrm() {
  const [data, setData] = useState<CrmSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const inFlight = useRef(false);

  const refresh = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    try {
      const response = await fetch("/api/snapshot", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "CRM sync failed");
      setData(json);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "CRM sync failed");
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    refresh();
    const tick = () => { if (document.visibilityState === "visible") refresh(); };
    const timer = window.setInterval(tick, Math.max(POLL_MS, 15000));
    document.addEventListener("visibilitychange", tick);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", tick); };
  }, [refresh]);

  return { data, loading, error, refresh };
}
