"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, ClipboardList, Link2, LockKeyhole, Search } from "lucide-react";
import { cleanDisplay, formatDate } from "@/lib/format";

type Message = {
  id: string;
  timestamp: string | null;
  direction: string | null;
  kind: string | null;
  preview_text: string | null;
  delivery_status: string | null;
  whatsapp_wamid: string | null;
};
type Recovered = {
  conversation_id: string;
  customer_phone: string;
  customer_name: string | null;
  started_at: string | null;
  last_message_at: string | null;
  message_count: number;
  status: string;
};
type RecoveredMessage = {
  conversation_id: string;
  timestamp: string | null;
  direction: string | null;
  preview_text: string | null;
};
type ReviewData = {
  ok: boolean;
  readonly: boolean;
  unassigned: Message[];
  recovered: Recovered[];
  recovered_messages: RecoveredMessage[];
};

export default function InboxReviewPage() {
  const [data, setData] = useState<ReviewData | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"unassigned" | "recovered">("unassigned");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/neon-review", { cache: "no-store", signal: controller.signal })
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Could not load inbox review");
        return json as ReviewData;
      })
      .then(setData)
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "Review unavailable");
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, []);

  const filteredUnassigned = useMemo(() => (data?.unassigned || []).filter((m) =>
    !query || [m.id, m.whatsapp_wamid, m.preview_text, m.kind, m.direction]
      .some((v) => cleanDisplay(v).toLowerCase().includes(query.toLowerCase()))
  ), [data, query]);

  const filteredRecovered = useMemo(() => (data?.recovered || []).filter((c) =>
    !query || [c.conversation_id, c.customer_phone, c.customer_name]
      .some((v) => cleanDisplay(v).toLowerCase().includes(query.toLowerCase()))
  ), [data, query]);

  return (
    <>
      <div className="panel" style={{ marginBottom: 18, padding: 22 }}>
        <h1>Inbox Review</h1>
        <p style={{ opacity: 0.8, marginTop: 6 }}>
          Neon Preview · Read only. Review unassigned historical messages and recovered conversations.
        </p>
        <p style={{ marginTop: 10, display: "flex", gap: 8, alignItems: "center" }}>
          <LockKeyhole size={16}/> No WhatsApp sends, customer reassignment, order changes, or deletes are available here.
        </p>
      </div>
      {loading && <div className="panel" style={{ padding: 24 }}>Loading secure Neon review…</div>}
      {error && <div className="warningBox"><AlertCircle size={16}/> {error}</div>}
      {data && (
        <section className="panel" style={{ padding: 18 }}>
          <div className="toolbar" style={{ gap: 12, flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className={tab === "unassigned" ? "pill" : "pill subtle"}
                onClick={() => setTab("unassigned")}>
                <ClipboardList size={15}/> Unlinked status records ({data.unassigned.length})
              </button>
              <button className={tab === "recovered" ? "pill" : "pill subtle"}
                onClick={() => setTab("recovered")}>
                <Link2 size={15}/> Recovered conversations ({data.recovered.length})
              </button>
            </div>
            <div className="search"><Search size={16}/>
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Search review records…" aria-label="Search review records"/>
            </div>
          </div>
          {tab === "unassigned" ? (
            <>
              <p style={{ margin: "12px 0 18px" }}>
                These records contain WhatsApp delivery statuses but no original message body or customer details.
                They are preserved and must not be linked by guesswork.
              </p>
              <div className="tableWrap">
                <table className="wide">
                  <thead><tr><th>Time</th><th>Type</th><th>Original message</th><th>Reference</th><th>Delivery status</th></tr></thead>
                  <tbody>
                    {filteredUnassigned.map((m) => <tr key={m.id}>
                      <td>{formatDate(m.timestamp)}</td>
                      <td>{cleanDisplay(m.kind) === "text" && cleanDisplay(m.direction) === "system" && !cleanDisplay(m.preview_text) ? "Unknown type" : cleanDisplay(m.kind)} <small>{cleanDisplay(m.direction) === "system" && !cleanDisplay(m.preview_text) ? "Missing source details" : cleanDisplay(m.direction)}</small></td>
                      <td style={{ minWidth: 250, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                        {cleanDisplay(m.preview_text).slice(0, 500) || "Status record only — no original message body"}
                      </td>
                      <td className="mono" title={m.whatsapp_wamid || m.id}>
                        {cleanDisplay(m.whatsapp_wamid || m.id).slice(0, 28)}…
                      </td>
                      <td><span className="pill subtle">{cleanDisplay(m.delivery_status) || "Unlinked status"}</span></td>
                    </tr>)}
                  </tbody>
                </table>
                {!filteredUnassigned.length && <div className="emptyState">No matching unassigned messages.</div>}
              </div>
            </>
          ) : (
            <>
              <p style={{ margin: "12px 0 18px" }}>
                These conversation records were reconstructed from existing message IDs and known phone numbers.
                Each record is flagged for review. No messages were moved or sent.
              </p>
              {filteredRecovered.map((c) => {
                const thread = data.recovered_messages
                  .filter((m) => m.conversation_id === c.conversation_id).slice(0, 10);
                return (
                  <div key={c.conversation_id} className="panel" style={{ padding: 16, marginBottom: 14 }}>
                    <strong>{cleanDisplay(c.customer_name) || cleanDisplay(c.customer_phone)}</strong>
                    <div className="mono" style={{ marginTop: 5 }}>{c.conversation_id}</div>
                    <p style={{ marginTop: 7 }}>
                      {c.message_count} messages · Last: {formatDate(c.last_message_at)}
                      {" · "}<span className="pill subtle">Recovered — Review</span>
                    </p>
                    <div style={{ marginTop: 14 }}>
                      {thread.map((m, i) => (
                        <div key={i} style={{ marginBottom: 9, overflowWrap: "anywhere" }}>
                          <small>{formatDate(m.timestamp)} · {cleanDisplay(m.direction)}</small>
                          <div>{cleanDisplay(m.preview_text).slice(0, 500) || "No text available"}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
              {!filteredRecovered.length && <div className="emptyState">No recovered conversations match.</div>}
            </>
          )}
        </section>
      )}
    </>
  );
}
