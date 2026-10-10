// Exact snapshot of the inactive n8n "Gate Backup Only" Code-node logic.
// Source workflow: yFR4lEKYbBGy55bP. Mock tests only: do not touch Neon or S3.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
const archiveGateSource = "const s=$input.first().json;if(s.preserve_orders!==true||s.allow_message_delete!==false||s.allow_media_delete!==false||Number(s.inactive_days)<15)throw new Error('Archive policy unsafe');const pending=Number(s.retryable_archives||0);const eligible=Number(s.eligible_conversations||0);const enabled=s.dry_run===false&&(eligible>0||pending>0);return [{json:{enabled,mode:s.dry_run?'DRY_RUN':'BACKUP_ONLY',eligible_conversations:Number(s.eligible_conversations),reason:s.dry_run?'dry_run_enabled':Number(s.eligible_conversations)===0&&pending===0?'no_eligible_conversations':'backup_only_eligible',deletes_enabled:false}}];";
function gate(input) {
  const output = runInNewContext('(function(){' + archiveGateSource + '\n})()', {
    $input: { first: () => ({ json: input }) }
  }, { timeout: 1000 });
  return JSON.parse(JSON.stringify(output))[0].json;
}
const safe = Object.freeze({
  dry_run: false, preserve_orders: true,
  allow_message_delete: false, allow_media_delete: false,
  inactive_days: 15, eligible_conversations: 0, retryable_archives: 0,
  archive_snapshots: 0, batch_size: 25
});
test('dry run fails closed even with pending retry', () => {
  const result = gate({ ...safe, dry_run: true, retryable_archives: 2 });
  assert.equal(result.enabled, false);
  assert.equal(result.mode, 'DRY_RUN');
});
test('only expired retryable archives trigger resume with no new candidates', () => {
  assert.equal(gate({ ...safe, retryable_archives: 1 }).enabled, true);
  assert.equal(gate({ ...safe, retryable_archives: 0 }).enabled, false);
});
test('new eligible conversation enables safe backup path', () => {
  assert.equal(gate({ ...safe, eligible_conversations: 1 }).enabled, true);
});
test('archive disabled on unsafe policies', () => {
  for (const wrong of [
    { preserve_orders: false },
    { allow_message_delete: true },
    { allow_media_delete: true },
    { inactive_days: 14 }
  ]) assert.throws(() => gate({ ...safe, ...wrong }), /Unsafe archive policy/);
});
test('no candidates and no retries produce a safe no-op', () => {
  const r = gate(safe);
  assert.equal(r.enabled, false);
  assert.equal(r.reason, 'no_eligible_conversations');
  assert.equal(r.deletes_enabled, false);
});
test('lease SQL contains concurrency lock, retry cap and new object keys', () => {
  const sql = readFileSync(new URL('./archive-backup-leases.sql', import.meta.url), 'utf8');
  assert.match(sql, /FOR UPDATE OF a SKIP LOCKED/);
  assert.match(sql, /a\.retry_count < 3/);
  assert.match(sql, /a\.lease_expires_at < now\(\)/);
  assert.match(sql, /'conversations\/'\|\|snap\.archive_id::text\|\|'\/'\|\|new_lease::text/);
  assert.match(sql, /WHERE NOT EXISTS\s*\(\s*SELECT 1 FROM public\.conversation_archives existing/);
});
test('leased finalizer validates active token, expiry and source blockers', () => {
  const sql = readFileSync(new URL('./archive-backup-leased-finalize.sql', import.meta.url), 'utf8');
  assert.match(sql, /snap\.lease_token IS DISTINCT FROM p_lease_token/);
  assert.match(sql, /snap\.lease_expires_at<=now\(\)/);
  assert.match(sql, /Archive lease token mismatch/);
  assert.match(sql, /Open order or WhatsApp outbox blocks archive/);
  assert.match(sql, /UPDATE public\.conversation_archives SET/);
  assert.doesNotMatch(sql, /DELETE\s+FROM\s+public\.(?:messages|orders|media_objects)/i);
});
