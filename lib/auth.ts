import { createHmac, timingSafeEqual } from "node:crypto";

export const CRM_SESSION_COOKIE = "sanureva_crm_session";
const SESSION_SECONDS = 60 * 60 * 12;

function credentials() {
  return {
    password: (process.env.CRM_DASHBOARD_PASSWORD || "").trim(),
    apiKey: (process.env.N8N_CRM_API_KEY || "").trim(),
  };
}

export function authIsConfigured(): boolean {
  const { password, apiKey } = credentials();
  return Boolean(password && apiKey);
}

function sessionSignature(expiresAt: number): string {
  const { password, apiKey } = credentials();
  return createHmac("sha256", apiKey)
    .update("sanureva:crm:session:v1:" + password + ":" + expiresAt)
    .digest("hex");
}

export function verifyCrmSession(value: string | undefined): boolean {
  if (!authIsConfigured() || !value) return false;
  const match = /^(\d{10})\.([a-f0-9]{64})$/.exec(value);
  if (!match) return false;
  const expiry = Number(match[1]);
  const now = Math.floor(Date.now() / 1000);
  if (expiry <= now || expiry > now + SESSION_SECONDS) return false;
  const expected = Buffer.from(sessionSignature(expiry), "hex");
  const received = Buffer.from(match[2], "hex");
  return received.length === expected.length && timingSafeEqual(expected, received);
}

export function checkCrmPassword(input: string): boolean {
  const { password } = credentials();
  if (!password || !authIsConfigured()) return false;
  const left = createHmac("sha256", password).update("compare").digest();
  const right = createHmac("sha256", input).update("compare").digest();
  return timingSafeEqual(left, right);
}

export function newCrmSession(): { value: string; maxAge: number } {
  const expiry = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  return { value: expiry + "." + sessionSignature(expiry), maxAge: SESSION_SECONDS };
}
