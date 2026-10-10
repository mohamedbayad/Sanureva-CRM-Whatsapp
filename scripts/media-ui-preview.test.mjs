// Tests the real MediaBubble TSX, rendered using synthetic WhatsApp message data.
// No live customer media IDs, credentials, S3 reads, WhatsApp calls or network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = readFileSync(resolve(root, 'components/MediaBubble.tsx'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    jsx: ts.JsxEmit.ReactJSX,
  }
}).outputText;
const mod = { exports: {} };
const mockRequire = (id) => id === '@/lib/format'
  ? { cleanDisplay: (value) => (value === undefined || value === null ? '' : String(value).trim()) }
  : require(id);
new Function('require', 'module', 'exports', compiled)(mockRequire, mod, mod.exports);
const { MediaBubble, chatPreview } = mod.exports;
const uri = '/api/media?id=1234567890123456&kind=audio&exp=2000000000&sig=' + 'a'.repeat(64);
const message = (kind, url = uri, text = '') => ({
  'Media Kind': kind, 'Media URL': url,
  'Message Content Snippet': text,
});
const render = (m) => renderToStaticMarkup(React.createElement(MediaBubble, { message: m }));

test('Original audio uses native, accessible browser controls and protected media URL', () => {
  const audio = render(message('audio', uri, '🎤 Nota de voz'));
  assert.match(audio, /<audio\b[^>]*controls/);
  assert.match(audio, /preload="none"/);
  assert.match(audio, /aria-label="Reproducir nota de voz"/);
  assert.ok(audio.includes('src="' + uri.replaceAll('&', '&amp;') + '"'));
  assert.doesNotMatch(audio, /<p class="mediaCaption">/);
});

test('Original images are rendered as media, not AI descriptions', () => {
  const imageUrl = uri.replace('kind=audio', 'kind=image');
  const html = render(message('image', imageUrl, 'Hola foto'));
  assert.match(html, /<a\b[^>]*target="_blank"/);
  assert.match(html, /<img\b[^>]*alt="Original photo from customer"/);
  assert.ok(html.includes('src="' + imageUrl.replaceAll('&', '&amp;') + '"'));
  assert.match(html, /Hola foto/);
});

test('Missing media stays explicit and does not invent a transcript', () => {
  const html = render(message('audio', '', '🎤 Nota de voz'));
  assert.match(html, /Audio no disponible/);
  assert.doesNotMatch(html, /<audio\b/);
  assert.equal(chatPreview(message('audio')), '🎤 Nota de voz');
  assert.equal(chatPreview(message('image')), '📷 Foto');
});

test('Documents and videos use original attachments without AI analysis', () => {
  const pdf = render(message('document', '/api/media?fixture=document', ''));
  const video = render(message('video', '/api/media?fixture=video', ''));
  assert.match(pdf, /Ver documento original/);
  assert.match(pdf, /href="\/api\/media\?fixture=document"/);
  assert.match(video, /<video\b[^>]*controls/);
  assert.match(video, /src="\/api\/media\?fixture=video"/);
});

test('Preview inbox disables manual sending and displays accurate media guidance', () => {
  const inbox = readFileSync(resolve(root, 'app/inbox/page.tsx'), 'utf8');
  assert.match(inbox, /const previewReadonly = process\.env\.NEXT_PUBLIC_CRM_PREVIEW_READONLY === "1"/);
  assert.match(inbox, /if \(previewReadonly \|\| !active \|\| !phone\) return/);
  assert.match(inbox, /Original attachments use signed, protected links/);
  assert.match(inbox, /Original images and voice notes appear when available/);
  assert.doesNotMatch(inbox, /Original media links are not available until/);
});

test('Server media route requires session, HMAC, no-store and supports byte ranges', () => {
  const route = readFileSync(resolve(root, 'app/api/media/route.ts'), 'utf8');
  assert.match(route, /verifyCrmSession/);
  assert.match(route, /timingSafeEqual/);
  assert.match(route, /"Cache-Control": "private, no-store"/);
  assert.match(route, /"X-Content-Type-Options": "nosniff"/);
  assert.match(route, /status: 206/);
  assert.match(route, /PREVIEW_MEDIA_KEY/);
});
