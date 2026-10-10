"use client";

import { FormEvent, useState } from "react";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logIn(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Sign in failed");
      window.location.replace(body.landing === "/inbox-review" ? "/inbox-review" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally { setBusy(false); }
  }

  return <main className="crmLogin">
    <div className="crmLoginCard">
      <div className="crmLoginMark">S</div>
      <h1>Sanureva CRM</h1>
      <p>{process.env.NEXT_PUBLIC_ENABLE_INBOX_REVIEW === "1" ? "Read-only Neon Preview: review unassigned messages and recovered conversations. No sends or edits." : "Sign in to see the private WhatsApp inbox and original customer media."}</p>
      <form onSubmit={logIn}>
        <label htmlFor="crm-password">Access password</label>
        <input id="crm-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} autoComplete="current-password" required />
        {error && <span className="crmLoginError">{error}</span>}
        <button type="submit" disabled={busy || !password}>{busy ? "Checking…" : "Sign in"}</button>
      </form>
    </div>
  </main>;
}
