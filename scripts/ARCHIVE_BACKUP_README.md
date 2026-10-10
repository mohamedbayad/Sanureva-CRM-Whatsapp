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
