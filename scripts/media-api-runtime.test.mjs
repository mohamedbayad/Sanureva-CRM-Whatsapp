// Executes the REAL Next.js /api/media route handler with a synthetic in-memory
// WhatsApp gateway. No real customer data, credentials, browser auth or network.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import ts from 'typescript';

const require = createRequire(import.meta.url);
const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const source = readFileSync(resolve(root, 'app/api/media/route.ts'), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const id = '1234567890123456';
const content = Uint8Array.from([0x41, 0x55, 0x44, 0x49, 0x4f, 0x21]);
const defaults = Object.freeze({
  VERCEL_ENV: 'preview',
  CRM_READ_SOURCE: 'neon_shadow',
  CRM_PREVIEW_DIRECT_READ: '1',
  CRM_PREVIEW_SESSION_SECRET: 'test-only-not-a-real-secret',
  N8N_MEDIA_READ_WEBHOOK_URL: 'https://n8n-fixture.invalid/webhook/qa-media-read',
  N8N_MEDIA_READ_KEY: 'test-only-preview-media-key',
});

function createHarness(envPatch = {}, upstream = {}) {
  const env = { ...defaults, ...envPatch };
  const calls = [];
  const fakeFetch = async (url, options) => {
    calls.push({ url, options });
    if (upstream.throws) throw new Error('test simulated upstream timeout');
    return new Response(upstream.body ?? content, {
      status: upstream.status ?? 200,
      headers: { 'Content-Type': upstream.mime ?? 'audio/mpeg' },
    });
  };
  const module = { exports: {} };
  const requireMock = (name) => {
    if (name === '@/lib/auth') return {
      verifyCrmSession: (token) => token === 'fixture-session',
      CRM_SESSION_COOKIE: 'fixture_crm_cookie',
    };
    return require(name);
  };
  new Function(
    'require', 'module', 'exports', 'process', 'fetch',
    'Response', 'Headers', 'Buffer', 'Uint8Array', 'AbortSignal', compiled
  )(requireMock, module, module.exports, { env }, fakeFetch,
    Response, Headers, Buffer, Uint8Array, AbortSignal);
  const signature = (kind, mediaId, expiry) => createHmac('sha256', env.CRM_PREVIEW_SESSION_SECRET || '')
    .update(kind + ':' + mediaId + ':' + expiry).digest('hex');
  const makeRequest = ({
    kind = 'audio', mediaId = id, expiry = Math.floor(Date.now()/1000) + 300,
    sig, cookie = 'fixture-session', range,
  } = {}) => {
    const signatureValue = sig ?? signature(kind, mediaId, expiry);
    const url = 'https://crm-preview.fixture.invalid/api/media?id=' + encodeURIComponent(mediaId)
      + '&kind=' + kind + '&exp=' + expiry + '&sig=' + signatureValue;
    return {
      nextUrl: new URL(url),
      cookies: { get: () => cookie ? { value: cookie } : undefined },
      headers: new Headers(range ? { range } : {}),
    };
  };
  return { GET: module.exports.GET, calls, makeRequest };
}
async function bodyBytes(response) {
  return Array.from(new Uint8Array(await response.arrayBuffer()));
}

test('signed preview audio proxy preserves binary bytes and upstream audio/mpeg', async () => {
  const h = createHarness();
  const response = await h.GET(h.makeRequest());
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('content-type'), 'audio/mpeg');
  assert.equal(response.headers.get('content-length'), String(content.length));
  assert.equal(response.headers.get('cache-control'), 'private, no-store');
  assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await bodyBytes(response), Array.from(content));
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].url, defaults.N8N_MEDIA_READ_WEBHOOK_URL);
  assert.equal(h.calls[0].options.method, 'POST');
  assert.equal(h.calls[0].options.headers['X-Preview-Media-Key'], defaults.N8N_MEDIA_READ_KEY);
  assert.equal(h.calls[0].options.headers['X-CRM-Key'], undefined);
  assert.deepEqual(JSON.parse(h.calls[0].options.body), { media_id: id });
});

test('native audio byte range returns exact bytes and 206 content range', async () => {
  const h = createHarness();
  const r = await h.GET(h.makeRequest({ range: 'bytes=1-3' }));
  assert.equal(r.status, 206);
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r.headers.get('content-range'), 'bytes 1-3/' + content.length);
  assert.equal(r.headers.get('content-length'), '3');
  assert.deepEqual(await bodyBytes(r), Array.from(content.slice(1,4)));
});

test('out of bounds audio byte ranges are rejected', async () => {
  const h = createHarness();
  const r = await h.GET(h.makeRequest({ range: 'bytes=100-150' }));
  assert.equal(r.status, 416);
  assert.equal(r.headers.get('content-range'), 'bytes */' + content.length);
});

test('signed original image retains image MIME and original bytes', async () => {
  const image = Uint8Array.from([0xff, 0xd8, 0xff, 0xd9]);
  const h = createHarness({}, { mime: 'image/jpeg', body: image });
  const r = await h.GET(h.makeRequest({kind:'image'}));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'image/jpeg');
  assert.deepEqual(await bodyBytes(r), Array.from(image));
});

test('a missing CRM session fails 401 before contacting n8n', async () => {
  const h = createHarness();
  const r = await h.GET(h.makeRequest({ cookie: null }));
  assert.equal(r.status, 401);
  assert.equal(h.calls.length, 0);
});

test('forged, expired or invalid media URLs cannot reach upstream gateway', async () => {
  const h = createHarness();
  const urls = [
    h.makeRequest({sig:'a'.repeat(64)}),
    h.makeRequest({expiry:Math.floor(Date.now()/1000)-10}),
    h.makeRequest({mediaId:'bad-id'}),
    h.makeRequest({kind:'exe'}),
    h.makeRequest({expiry:Math.floor(Date.now()/1000)+10000}),
  ];
  for (const url of urls) {
    const result = await h.GET(url);
    assert.equal(result.status, 403);
  }
  assert.equal(h.calls.length, 0);
});

test('missing Preview-only media key fails closed', async () => {
  const h = createHarness({N8N_MEDIA_READ_KEY:''});
  const r = await h.GET(h.makeRequest());
  assert.equal(r.status, 503);
  assert.equal(h.calls.length, 0);
});

test('insecure or unexpected media gateway URL is rejected before network', async () => {
  for (const url of ['http://n8n-fixture.invalid/webhook/media', 'https://n8n-fixture.invalid/api/send']) {
    const h = createHarness({N8N_MEDIA_READ_WEBHOOK_URL:url});
    const r = await h.GET(h.makeRequest());
    assert.equal(r.status, 503);
    assert.equal(h.calls.length, 0);
  }
});

test('upstream 404 fails without returning media', async () => {
  const h = createHarness({}, {status:404});
  const r = await h.GET(h.makeRequest());
  assert.equal(r.status, 404);
});

test('gateway network failure produces a safe 502 without exposing credentials', async () => {
  const h = createHarness({}, {throws:true});
  const r = await h.GET(h.makeRequest());
  assert.equal(r.status, 502);
  assert.doesNotMatch(await r.text(), /test-only-preview-media-key/);
});
