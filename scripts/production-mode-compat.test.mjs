// Production-mode regression tests for the CRM release candidate.
// Runs real POST/GET route handlers against mocks. NEVER sends WhatsApp messages
// or connects to production n8n, Neon, or original customer media.
import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createHmac } from "node:crypto";
import ts from "typescript";
const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const load = path => readFileSync(resolve(root, path), "utf8");
const require = createRequire(import.meta.url);
const transpile = code => ts.transpileModule(code, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }
}).outputText;

test("Production snapshot defaults to existing n8n, not preview Neon direct reader", () => {
  const source = load("lib/n8n.ts");
  assert.match(source, /const sourceMode = process\.env\.CRM_READ_SOURCE \|\| "n8n"/);
  assert.match(source, /process\.env\.VERCEL_ENV === "preview" &&/);
  assert.match(source, /sourceMode === "neon_shadow" && process\.env\.CRM_PREVIEW_DIRECT_READ === "1"/);
  assert.match(source, /if \(sourceMode !== "neon" && sourceMode !== "neon_shadow"\) return readCurrent\(\)/);
  assert.match(source, /action: "snapshot"/);
  const guard = load("scripts/verify-neon-preview.mjs");
  assert.match(guard, /process\.env\.VERCEL_ENV === "preview"/);
  assert.match(guard, /if \(!isTargetPreview\)/);
});

test("Production outbox remains connected to the original n8n queue, Preview rejects send", async () => {
  const compiled = transpile(load("app/api/outbox/route.ts"));
  async function execute(env) {
    let count = 0;
    let last = null;
    const fakeRequire = id => {
      if (id === "next/server") return {
        NextResponse: { json: (body, options = {}) => new Response(JSON.stringify(body), {
          status: options.status ?? 200, headers: { "Content-Type": "application/json" }
        }) }
      };
      if (id === "@/lib/n8n") return { queueWhatsAppMessage: async payload => {
        count++;
        last = payload;
        return { requestId: "synthetic-request" };
      }};
      return require(id);
    };
    const mod = { exports: {} };
    new Function("require","module","exports","process","Response",compiled)(
      fakeRequire,mod,mod.exports,{env},Response
    );
    const payload = { phone: "0000000000", type: "Text", message: "SYNTHETIC ONLY" };
    const response = await mod.exports.POST({json:async()=>payload});
    return {response,count,last};
  }
  const prod = await execute({ VERCEL_ENV:"production" });
  assert.equal(prod.response.status,202);
  assert.equal(prod.count,1);
  assert.equal(prod.last.message,"SYNTHETIC ONLY");
  const preview = await execute({ VERCEL_ENV:"preview", CRM_READ_SOURCE:"neon_shadow" });
  assert.equal(preview.response.status,403);
  assert.equal(preview.count,0);
});

test("Production media proxy uses original CRM key + get_media, never Preview media key", async () => {
  const compiled = transpile(load("app/api/media/route.ts"));
  const mediaId="1234567890123456";
  const secret="synthetic-prod-crm-key";
  const exp=Math.floor(Date.now()/1000)+120;
  const sig=createHmac("sha256",secret).update("audio:"+mediaId+":"+exp).digest("hex");
  const gateway="https://n8n-production-fixture.invalid/webhook/crm-gateway";
  const captured=[];
  const fetchMock=async (url,options)=>{
    captured.push({url,options});
    return new Response(Uint8Array.from([79,71,71,33]),{
      status:200,headers:{"Content-Type":"audio/ogg"}
    });
  };
  const fakeRequire=id=>{
    if(id==="@/lib/auth")return{
      verifyCrmSession: token=>token==="synthetic-session",
      CRM_SESSION_COOKIE:"synthetic_cookie",
    };
    return require(id);
  };
  const mod={exports:{}};
  const env={
    VERCEL_ENV:"production",N8N_CRM_API_KEY:secret,N8N_CRM_WEBHOOK_URL:gateway,
    N8N_MEDIA_READ_KEY:"SHOULD_NOT_BE_USED",
    N8N_MEDIA_READ_WEBHOOK_URL:"https://n8n-preview-fixture.invalid/webhook/media",
  };
  new Function("require","module","exports","process","fetch","Response","Headers","Buffer","Uint8Array","AbortSignal",compiled)(
    fakeRequire,mod,mod.exports,{env},fetchMock,Response,Headers,Buffer,Uint8Array,AbortSignal
  );
  const url=new URL("https://crm-prod-fixture.invalid/api/media?id="+mediaId+"&kind=audio&exp="+exp+"&sig="+sig);
  const response=await mod.exports.GET({
    nextUrl:url,
    headers:new Headers(),
    cookies:{get:()=>({value:"synthetic-session"})},
  });
  assert.equal(response.status,200);
  assert.equal(response.headers.get("content-type"),"audio/ogg");
  assert.equal(captured.length,1);
  assert.equal(captured[0].url,gateway);
  assert.equal(captured[0].options.headers["X-CRM-Key"],secret);
  assert.equal(captured[0].options.headers["X-Preview-Media-Key"],undefined);
  assert.deepEqual(JSON.parse(captured[0].options.body),{
    action:"get_media",media_id:mediaId
  });
});

test("No archive migration or backup scheduling happens as a code build side effect", () => {
  const manifest=JSON.parse(load("package.json"));
  assert.equal(manifest.scripts.prebuild,"node scripts/verify-neon-preview.mjs");
  assert.doesNotMatch(load("scripts/verify-neon-preview.mjs"), /(?:DELETE FROM|DROP TABLE|ALTER TABLE|UPDATE public\.)/i);
  const readme=load("scripts/PRODUCTION_ROLLOUT_CHECKLIST.md");
  assert.match(readme,/Do not enable text\/media purge/i);
  assert.match(readme,/explicit/i);
});
