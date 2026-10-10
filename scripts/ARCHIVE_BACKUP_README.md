# Sanureva 15-day Backup-only Worker — rollout hold

**Status (2026-10-10): DRAFT / INACTIVE. NOT PRODUCTION-READY.**

- n8n [Sanureva — 15-day Conversation Backup ONLY](https://n8n-dhhy.srv1952669.hstgr.cloud/workflow/yFR4lEKYbBGy55bP), id `yFR4lEKYbBGy55bP`, **unpublished/inactive**.
- Existing synthetic storage QA worker `pWpPHAXFz1AGwdUb` remains inactive too.
- Main Neon `archive_settings`: `inactive_days=15`, `dry_run=true`, `preserve_orders=true`, `allow_message_delete=false`, `allow_media_delete=false`. Preserve these.
- No archive scheduler, `DELETE` node, media binary upload, order update, or WhatsApp send exists in the new worker.
- The new worker's completed execution payloads are not saved in n8n history, to limit customer-text retention.

## Intended flow — ONLY after review and explicit activation

1. Manual start; policy gate verifies backup-only settings, candidate count, and no unresolved `pending` archival reservations. Dry-run returns a no-op.
2. Atomically reserve one eligible conversation snapshot with a fresh UUID and `conversations/<uuid>.jsonl.gz` key in private `sanureva-archives`.
3. Recheck inactivity >=15 days, message count/media classification, active WooCommerce order status, and pending WhatsApp outbox before reading message data.
4. Encode message text, original media markers, message directions/timestamps, and order **references** as newline-delimited JSON. **Never** embed original image/audio/PDF binary or full order records.
5. Compress Gzip; SHA-256 compressed bytes. Upload with private S3 ACL to the per-snapshot key. Download the same object; independently compute SHA-256 again. Decompress and verify byte-identical text.
6. Finalize via `public.finalize_sanureva_backup(uuid,sha256,compressed_bytes,message_count)`, which re-evaluates age/message/media/order/outbox eligibility and atomically creates archive message ledger entries and marks the snapshot `verified`.
7. On an error, **do not delete customer messages, media, or orders**. An unverified/pending snapshot requires inspection before allowing future backups.

## Database migrations

- `scripts/archive-media-count-view.sql` — marker-aware media counting; view change already applied to main Neon and separately QA-tested; revert via `scripts/archive-media-count-view-rollback.sql` if required.
- `scripts/archive-backup-finalize-function.sql` — **only installed on isolated Neon QA branch**, **NOT** on main Neon yet. Application to main requires code review and QA.
- QA Neon branch `br-mute-snow-b7eqhu6o`: contains fake archived messages and order/outbox blockers. Do not use as a live CRM database.

## Verified tests

- Inactive safety no-op in n8n execution `37819` succeeded with `dry_run_enabled` and no changes.
- Private storage gzip SHA-256 equality + restored byte identity (previous synthetic QA workflow execution `37763`).
- QA-only PostgreSQL function accepted 1 synthetic pending archive, registered 1 message key, then returned `already_verified` on replay without duplicates.
- QA finalizer rejected invalid checksum replay, an open-order conversation, and a pending-outbox conversation. `dry_run` blocks execution unless deliberately turned off.
- Every temporary QA policy toggle was returned to `dry_run=true` after tests. Main remained unchanged during finalizer QA.

## Important blockers before activation

1. **Full positive n8n-to-Postgres-to-S3 test on a dedicated QA database credential** is not done. The new n8n Postgres credential currently targets the regular Sanureva database; dry-run prevents writes.
2. The current reservation graph deliberately **fails closed if pending archive rows exist**. Implement and verify a bounded lease, concurrency-safe resume/recovery process before running unattended. Do not manually override the pending gate to force a reupload.
3. Confirm final object key immutability / collision prevention under concurrent executions, exact compressed byte sizes, and retention/access-control policies for backups.
4. Validate archive restoration into an isolated database without replacing existing messages, correct message-key deduplication, and original media-reference handling; verify real-user browser audio/image playback separately.
5. Back up and review current Neon DB, deploy finalizer migration only after QA, and explicitly authorize activating the worker and switching `dry_run=false`. Deletion switches **must** remain false.
6. Do not merge PR #2 to main until these acceptance gates pass.

## Operational principles

- Existing Orders, WooCommerce confirmation events, WhatsApp outbox and original media files remain source of truth and must not be deleted or altered.
- Only conversations inactive for 15 full days **and without active orders/outbox work** are eligible.
- Treat media-labelled PDF records lacking a WhatsApp media ID as references, **not** as verified stored PDF binaries.
- Use only one snapshot per eligible conversation/last-activity combination; SQL unique constraints prevent duplicate archive rows, but concurrency of object uploads still needs a lease-based test.
- This is **backup-only**, not a purge or retention policy; source conversations must remain readable in CRM.

## Retry gate checkpoint (2026-10-10)

The inactive n8n workflow `yFR4lEKYbBGy55bP` now allows the claim path when `eligible_conversations > 0` **or** `pending_archives > 0`, only while `dry_run=false` and all no-delete/keep-orders safeguards pass. This fixes the previous no-new-candidate resume gate. Current operation remains dry-run and inactive.

The isolated branch confirmed one initial unique lease claim and that an immediate second claim does not duplicate it. The expired-lease retry execution was not confirmed because the database connector rejected the follow-up test. The QA policy was restored to `dry_run=true`. Do not label expiry recovery or simultaneous concurrency verified. Retain activation hold and test using a scoped QA Postgres credential before using unattended backups.

## Regression CI QA (2026-10-10)

The actual `Gate Backup Only` n8n Code-node logic has been snapshotted in `scripts/archive-lease-gate.test.mjs`, with **7 Node.js tests** for dry-run fail-closed behavior, resumable pending-only archives, zero-candidate no-op, unsafe policy rejection, and structural lease/finalizer SQL invariants. CI workflow `.github/workflows/neon-snapshot-pr.yml` now executes this suite during feature-branch validation. [Run 38083772238](https://github.com/mohamedbayad/Sanureva-CRM-Whatsapp/actions/runs/38083772238) passed all 7 tests, typecheck, and production build.

The lease migration `scripts/archive-backup-leases.sql` was updated to prevent an exhausted/previously-reserved archive candidate from blocking newer conversations; the inactive worker now counts only expired/unleased `pending` or `failed` snapshots with `retry_count < 3`. Audit `scripts/archive-lease-audit-readonly.sql` verified the QA branch currently has 3 retryable synthetic rows and no mismatched S3 lease-token paths, with `dry_run=true`.

**Limitations:** The 7 tests exercise a snapshot of n8n gate logic plus SQL source checks; they are not a live concurrent Postgres execution or full n8n-to-QA-Postgres-to-S3 validation. Since changing the QA policy to run the expired-lease scenario was blocked by the connector, **expired-lease resume and stale-token runtime rejection remain unverified**. Do not enable archive automation, deploy SQL functions on Main, or change dry-run. Any later edit to the n8n gate requires updating this test snapshot.

## QA PostgreSQL credential handoff — 2026-10-10

On isolated Neon branch `qa-archive-lifecycle-20261010` (`br-mute-snow-b7eqhu6o`), a minimal archive role `sanureva_archive_qa` was created **via SQL** and granted SELECT only on policy/candidates/conversations/messages/orders/outbox/archive ledgers, INSERT+UPDATE on conversation archives, INSERT on archived keys, and EXECUTE of QA lease functions. It has `NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS`, no inherited roles, no schema CREATE, no permissions to DELETE messages/media/orders or UPDATE orders. Any API-created role inheriting `neon_superuser` was removed immediately and verified absent.

**Do not use or modify the existing n8n credential** `Postgres account` — it is connected to Main. The connected n8n tool can inspect credentials but cannot create new ones. For a full isolated test, an administrator must create a QA-only login and an n8n Postgres credential securely, without sharing a password in ChatGPT:

- Neon project: `holy-bread-50636263`, branch: `br-mute-snow-b7eqhu6o`, database: `sanureva`
- Host: `ep-little-scene-b74c4vgm.c-13.us-east-1.aws.neon.tech`, port `5432`, TLS/SSL required
- Role: `sanureva_archive_qa`; **currently NOLOGIN**. Only enable LOGIN and set a strong unique password in the QA branch's SQL editor. Never reuse the Main role, password, or connection string.
- In n8n, create a **new** credential named `Sanureva Neon Archive QA (isolated)` and duplicate the *inactive* Backup-only workflow. Replace **every Postgres node credential in that duplicate only** with the QA credential.
- Before triggering, isolate the S3 test object namespace from live customer archives and verify finalizer SQL keys/buckets correspond to that isolation. The current `sanureva-archives` S3 credential alone does not establish that objects are QA-only.
- Keep source worker and Main `archive_settings` unchanged (`dry_run=true`); never activate/publish the QA or production worker for routine automation during tests.

The guarded role policy is versioned in `scripts/archive-qa-role.sql`, which refuses to run without an isolated synthetic conversation fixture. The QA connection remains **unconfigured**, and live leased end-to-end testing remains **pending**.

CI [run 38085754981](https://github.com/mohamedbayad/Sanureva-CRM-Whatsapp/actions/runs/38085754981): 8/8 archive regression tests, TypeScript, and build passed. These are static/mocked checks and role permission introspection, not a real positive credentialed backup end-to-end.

## Isolated end-to-end success — 2026-10-10

**Execution 38441** ran the inactive 19-node QA-only n8n worker `JjYsvczPWfe47E1P` against verified Neon QA credential `Postgres account 2` (database user `sanureva_archive_qa`, isolated QA fixture present). The isolated `claim_sanureva_backup` and `finalize_sanureva_leased_backup` database functions were amended in QA branch `br-mute-snow-b7eqhu6o` to operate only on `TEST-ARCH-LEASE-NEW` and private S3 paths `qa/conversations/<archive-id>/<lease-token>.jsonl.gz`. The QA migration source is in `scripts/archive-qa-isolated-functions.sql`; do **NOT** run it on main Neon.

A synthetic expired `pending` snapshot started at `retry_count=0` with the former, non-QA test object key. After temporary **QA-only** `dry_run=false` and n8n manual execution, post-run SQL showed **one** snapshot with `status=verified`, `retry_count=1`, object key beginning `qa/conversations/`, a 64-hex-character SHA-256 hash, positive compressed byte count, `verified_at` set, `message_count=2`, `media_count=1`, two archived-message ledger keys and two intact original messages. The pipeline's application checks require compressed SHA-256 agreement and byte-identical gzip restore before calling the finalizer.

QA `dry_run=true` was restored and independently rechecked. Main Neon was separately verified to retain safe policy (dry-run true, orders preservation and both deletion switches disabled), **zero archives, zero archived message keys, 12 orders**. The QA workflow stays **inactive** and execution retention disabled; the execution's detailed node records are not available, so evidence consists of the started n8n execution ID and final SQL invariants, rather than an exported full node execution trace.

**Still outstanding:** runtime challenge/rejection of stale or wrong lease token, double-claim concurrent transaction race (as opposed to sequential claim tests), post-archive restore into a clean isolated database, 15-day live candidate production readiness and browser audio playback QA. Do not enable automatic archiving, disable main dry-run, or merge PR #2 until review and explicit release authorization. Never turn on message/media deletion.
