"use client";

import { useState } from "react";
import { RefreshCcw, ClipboardCopy, ShieldCheck } from "lucide-react";
import { SHEET_NAMES } from "@/lib/contracts";
import { cleanDisplay } from "@/lib/format";
import type { CrmSnapshot, SheetRecord } from "@/lib/types";

type Probe = {
  checked: boolean;
  status: number | null;
  contentType: string;
  contentRange: string;
  noStore: boolean;
  passed: boolean;
  error?: string;
};
type Selection = { image: string; audios: string[]; imageCount: number; audioCount: number };
const blank: Probe = {
  checked: false, status: null, contentType: "", contentRange: "",
  noStore: false, passed: false,
};

function safeMediaUrl(row: SheetRecord, kind: string): string {
  if (cleanDisplay(row["Media Kind"]).toLowerCase() !== kind) return "";
  const src = cleanDisplay(row["Media URL"]);
  // Only permit our own authenticated, signed /api/media path.
  if (!src.startsWith("/api/media?")) return "";
  const parsed = new URL(src, "https://crm.invalid");
  if (parsed.origin !== "https://crm.invalid" ||
      parsed.pathname !== "/api/media" ||
      parsed.searchParams.get("kind") !== kind ||
      !/^\d{8,30}$/.test(parsed.searchParams.get("id") || "") ||
      !/^[a-f0-9]{64}$/.test(parsed.searchParams.get("sig") || "")) return "";
  return src;
}

async function probeMedia(src: string, kind: "image" | "audio"): Promise<Probe> {
  if (!src) return { ...blank, checked: true, error: "No protected original-media link" };
  try {
    const response = await fetch(src, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: { Range: "bytes=0-0" },
    });
    const contentType = (response.headers.get("content-type") || "").split(";")[0].trim();
    const contentRange = response.headers.get("content-range") || "";
    const noStore = (response.headers.get("cache-control") || "").includes("no-store");
    const expected = kind === "audio" ? /^audio\// : /^image\//;
    const passed = response.status === 206 && expected.test(contentType) &&
      /^bytes 0-0\/\d+$/.test(contentRange) && noStore;
    return { checked: true, status: response.status, contentType,
      contentRange, noStore, passed };
  } catch {
    return { ...blank, checked: true, error: "Media network request failed" };
  }
}

function statusLabel(p: Probe) {
  if (!p.checked) return "Not checked";
  if (p.passed) return "PASS — secure binary response";
  return p.error || "CHECK — response did not meet expected conditions";
}

const panel: React.CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 14, padding: 18,
  background: "var(--panel)", display: "grid", gap: 10, minWidth: 0,
};
const subtle: React.CSSProperties = { color: "var(--muted)", fontSize: 12, lineHeight: 1.6 };
const controls: React.CSSProperties = {
  border: "1px solid var(--line)", borderRadius: 10, background: "white",
  padding: "9px 13px", fontSize: 13, cursor: "pointer",
};

export function MediaReviewClient() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [selection, setSelection] = useState<Selection | null>(null);
  const [audioIndex, setAudioIndex] = useState(0);
  const [imageProbe, setImageProbe] = useState<Probe>(blank);
  const [audioProbe, setAudioProbe] = useState<Probe>(blank);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);
  const [audioDecoded, setAudioDecoded] = useState(false);
  const [audioStarted, setAudioStarted] = useState(false);
  const [audioError, setAudioError] = useState(false);
  const [heardAudio, setHeardAudio] = useState(false);
  const [copyStatus, setCopyStatus] = useState("");

  const activeAudio = selection?.audios[audioIndex] || "";

  async function runChecks() {
    if (loading) return;
    setLoading(true); setError(""); setSelection(null); setImageProbe(blank);
    setAudioProbe(blank); setImageLoaded(false); setImageFailed(false);
    setAudioDecoded(false); setAudioStarted(false); setAudioError(false); setHeardAudio(false);
    setAudioIndex(0); setCopyStatus("");
    try {
      const response = await fetch("/api/snapshot", { cache: "no-store", credentials: "same-origin" });
      if (!response.ok) throw new Error(
        response.status === 401 ? "Sign in to CRM before running QA" : "Could not read protected CRM snapshot"
      );
      const snapshot = await response.json() as CrmSnapshot;
      const messages = snapshot.sheets[SHEET_NAMES.messages] || [];
      const images = messages.map(row => safeMediaUrl(row, "image")).filter(Boolean);
      const audios = messages.map(row => safeMediaUrl(row, "audio")).filter(Boolean);
      const current: Selection = {
        image: images[images.length - 1] || "",
        audios: audios.reverse(),
        imageCount: images.length,
        audioCount: audios.length,
      };
      setSelection(current);
      const [imageTest, audioTest] = await Promise.all([
        probeMedia(current.image, "image"),
        probeMedia(current.audios[0] || "", "audio"),
      ]);
      setImageProbe(imageTest);
      setAudioProbe(audioTest);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "QA could not start");
    } finally {
      setLoading(false);
    }
  }

  async function nextAudio() {
    if (!selection || selection.audios.length < 2) return;
    const index = (audioIndex + 1) % selection.audios.length;
    setAudioIndex(index); setAudioDecoded(false); setAudioStarted(false);
    setAudioError(false); setHeardAudio(false); setAudioProbe(blank);
    setAudioProbe(await probeMedia(selection.audios[index], "audio"));
  }

  function report() {
    return JSON.stringify({
      test: "sanureva-preview-media-qa",
      includes_customer_data: false,
      image_available: !!selection?.image,
      audio_available: !!activeAudio,
      image_count: selection?.imageCount || 0,
      audio_count: selection?.audioCount || 0,
      image_http_status: imageProbe.status,
      image_mime: imageProbe.contentType,
      image_range_and_no_store: imageProbe.passed,
      image_rendered: imageLoaded,
      image_render_error: imageFailed,
      audio_http_status: audioProbe.status,
      audio_mime: audioProbe.contentType,
      audio_range_and_no_store: audioProbe.passed,
      audio_browser_can_decode: audioDecoded,
      audio_play_started: audioStarted,
      audio_play_error: audioError,
      user_confirmed_audible: heardAudio,
    }, null, 2);
  }

  async function copyReport() {
    try {
      await navigator.clipboard.writeText(report());
      setCopyStatus("Safe diagnostics copied (no names, numbers, media links or audio data).");
    } catch { setCopyStatus("Clipboard unavailable in this browser."); }
  }

  return (
    <div style={{ display: "grid", gap: 18, maxWidth: 1100 }}>
      <div className="pageHeader">
        <div>
          <h1>Original WhatsApp Media · Browser QA</h1>
          <p>Protected Preview only. This read-only test fetches original image and audio
            with your CRM login; no transcripts, message sending, order changes or data uploads.</p>
        </div>
      </div>

      <div style={{ ...panel, gap: 13 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
          <ShieldCheck size={20} color="var(--accent-strong)" />
          <strong>Authenticated, read-only playback verification</strong>
        </div>
        <p style={subtle}>Use a signed-in Preview account. Click Start checks to select
          the most recent available original image and voice note. The browser plays
          media from the same protected API used by Inbox.</p>
        <div>
          <button style={controls} onClick={runChecks} disabled={loading}>
            <RefreshCcw size={14} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {loading ? "Checking…" : "Start / refresh checks"}
          </button>
        </div>
        {error && <p className="errorBox" role="alert">{error}</p>}
        {selection && <p style={subtle}>
          Signed source links available: {selection.imageCount} image(s), {selection.audioCount} audio(s).
          Only safe status data is included in the copied report.
        </p>}
      </div>

      {selection && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 330px), 1fr))", gap: 16 }}>
          <section style={panel}>
            <strong>Original image</strong>
            <p style={subtle}>HTTP: {statusLabel(imageProbe)}
              {imageProbe.status !== null ? " (" + imageProbe.status + ")" : ""}
              {imageProbe.contentType ? " · " + imageProbe.contentType : ""}
            </p>
            {selection.image ? (
              <>
                <img src={selection.image} alt="Original WhatsApp QA attachment"
                  style={{ display: "block", maxWidth: "100%", maxHeight: 360, objectFit: "contain", borderRadius: 8 }}
                  onLoad={(event) => { setImageLoaded(event.currentTarget.naturalWidth > 0); setImageFailed(false); }}
                  onError={() => { setImageFailed(true); setImageLoaded(false); }}
                />
                <p style={subtle}>
                  Browser decoded image: {imageLoaded ? "PASS" : imageFailed ? "FAILED" : "Waiting for image load"}
                </p>
              </>
            ) : <p style={subtle}>No signed original image available in CRM snapshot.</p>}
          </section>
          <section style={panel}>
            <strong>Original voice note</strong>
            <p style={subtle}>HTTP: {statusLabel(audioProbe)}
              {audioProbe.status !== null ? " (" + audioProbe.status + ")" : ""}
              {audioProbe.contentType ? " · " + audioProbe.contentType : ""}
            </p>
            {activeAudio ? (
              <>
                <audio key={activeAudio} src={activeAudio} controls preload="metadata"
                  aria-label="Play original WhatsApp voice note for QA"
                  style={{ display: "block", width: "100%" }}
                  onLoadedMetadata={() => setAudioDecoded(true)}
                  onCanPlay={() => setAudioDecoded(true)}
                  onPlaying={() => setAudioStarted(true)}
                  onError={() => setAudioError(true)}
                />
                <p style={subtle}>Browser decode: {audioError ? "FAILED" : audioDecoded ? "PASS" : "Waiting"}</p>
                <p style={subtle}>Player: {audioStarted ? "Playback started" : "Press Play to test sound"}</p>
                <button style={controls} disabled={!audioStarted || audioError} onClick={() => setHeardAudio(true)}>
                  {heardAudio ? "✓ I heard the original audio" : "Confirm you heard the audio"}
                </button>
                {selection.audios.length > 1 && <button style={controls} onClick={nextAudio}>Test next voice note</button>}
              </>
            ) : <p style={subtle}>No signed original audio available in CRM snapshot.</p>}
          </section>
        </div>
      )}

      {selection && (
        <section style={panel}>
          <strong>QA report · No personal data</strong>
          <p style={subtle}>The test results below contain only MIME types, HTTP statuses
            and pass/fail flags. Customer phone numbers, media IDs, signed URLs and image/audio
            content are intentionally excluded.</p>
          <pre style={{ maxWidth: "100%", overflowX: "auto", fontSize: 11, background: "var(--panel-soft)", padding: 12, borderRadius: 10 }}>{report()}</pre>
          <div><button style={controls} onClick={copyReport}><ClipboardCopy size={14} style={{ verticalAlign: "middle", marginRight: 6 }}/>Copy safe QA results</button></div>
          {copyStatus && <p role="status" style={subtle}>{copyStatus}</p>}
        </section>
      )}
    </div>
  );
}
