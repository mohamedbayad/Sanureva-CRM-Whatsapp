import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const read = path => readFileSync(resolve(root, path), 'utf8');
const page = read('app/media-review/page.tsx');
const ui = read('components/MediaReviewClient.tsx');
const proxy = read('proxy.ts');
const sidebar = read('components/Sidebar.tsx');

test('Media QA page only exists in protected Neon Preview', () => {
  assert.match(page, /VERCEL_ENV === "preview"/);
  assert.match(page, /CRM_READ_SOURCE === "neon_shadow"/);
  assert.match(page, /CRM_PREVIEW_DIRECT_READ === "1"/);
  assert.match(page, /if \(!previewOnly\) notFound\(\)/);
  assert.match(page, /robots:\s*\{ index: false, follow: false \}/);
  assert.match(proxy, /verifyCrmSession/);
  assert.doesNotMatch(proxy, /media-review.*NextResponse\.next\(\)/);
});

test('Media QA is visible in Preview navigation only', () => {
  assert.match(sidebar, /NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1" \? \[\{ href: "\/media-review"/);
});

test('QA only loads signed same-origin media endpoints', () => {
  assert.match(ui, /src\.startsWith\("\/api\/media\?"\)/);
  assert.match(ui, /parsed\.pathname !== "\/api\/media"/);
  assert.match(ui, /parsed\.searchParams\.get\("kind"\) !== kind/);
  assert.match(ui, /parsed\.searchParams\.get\("sig"\)/);
  assert.match(ui, /fetch\("\/api\/snapshot"/);
  assert.match(ui, /credentials: "same-origin"/);
});

test('Network probe verifies audio and image MIME, HTTP 206 and no-store', () => {
  assert.match(ui, /headers: \{ Range: "bytes=0-0" \}/);
  assert.match(ui, /response\.status === 206/);
  assert.match(ui, /kind === "audio" \? \^audio/);
  assert.match(ui, /contentRange/);
  assert.match(ui, /noStore/);
});

test('Original image and voice-note playback require actual browser events', () => {
  assert.match(ui, /onLoad=\{/);
  assert.match(ui, /onLoadedMetadata=\{/);
  assert.match(ui, /onCanPlay=\{/);
  assert.match(ui, /onPlaying=\{/);
  assert.match(ui, /Confirm you heard the audio/);
  assert.match(ui, /setAudioError\(true\)/);
});

test('Diagnostics omit customer identifiers, signed URLs and media data', () => {
  const reportBody = ui.split('function report() {')[1]?.split('async function copyReport()')[0] || '';
  assert.ok(reportBody, 'Expected safe report function');
  assert.doesNotMatch(reportBody, /(?:customer_phone|customer_name|whatsapp_wamid|media_id|signed_url|\.audios\[|\.image\s*,)/i);
  assert.match(reportBody, /user_confirmed_audible: heardAudio/);
  assert.match(reportBody, /audio_browser_can_decode: audioDecoded/);
});
