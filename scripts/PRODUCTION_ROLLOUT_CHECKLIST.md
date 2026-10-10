# Sanureva CRM — Production release & 15-day backup-only checklist

**Status: HOLD — Draft PR #2, no merge, no Production rollout approved.**  
Updated: 2026-10-10. This checklist is for release review, not permission to deploy, publish, delete records or switch off dry-run.

## Verified environment state

- Preview feature branch: `feature/neon-snapshot-fallback-20261009`; CI compiles, typechecks, archive lease regression tests and synthetic media component tests.
- Protected Vercel Preview is READY. User-confirmed browser Media Playback QA PASSED for one original image and one audible voice note; Inbox/Orders/Dashboard acceptance is still pending. Connected Vercel tool remains blocked by team authorization (403).
- Read-only n8n WhatsApp media workflow `JwyevJi6J5pQbcUd` is active. It responds with WhatsApp original binary MIME as `Content-Type`. Actual response after the latest MIME fix needs authenticated browser/network validation.
- Inactive QA backup worker `JjYsvczPWfe47E1P`; inactive synthetic worker `pWpPHAXFz1AGwdUb`; inactive independent QA restore worker `L8QjmzHhGE6fnCIA`. **Do not enable these in Production.**
- QA accomplishments: isolated S3 gzip SHA-256 and byte-exact roundtrip; QA-only expired-lease retry to verified; independent download; 2-row isolated restore import and replay with 0 duplicates; 2-request parallel claim returned exactly one reservation. No prolonged concurrency stress test.
- **Main Neon:** archive policy `dry_run=true`, `preserve_orders=true`, `allow_message_delete=false`, `allow_media_delete=false`; no real archives or archived keys at last audit. Counts of active orders and messages may change during ongoing sync.
- SQL finalizer / lease migrations are QA-only; **not installed on Main**. Existing candidate media-count VIEW was corrected on Main; rollback is available.

## Gate A: CRM Preview — MEDIA PLAYBACK VERIFIED; OTHER CHECKS PENDING

Use the latest Vercel Preview from the feature branch and a legitimately authenticated browser session. Never copy CRM cookies, passwords or original media URLs into GitHub artifacts.

- [ ] Authenticate successfully through Vercel protection and CRM login. Ensure an unauthenticated visit does not expose Dashboard, Inbox, Orders, `/api/media` or `/api/snapshot`.
- [ ] Verify Dashboard, Inbox, Orders show coherent conversation/message/order counts; spot-check no duplicate orders, no status callback bubbles or unlinked messages.
- [ ] Find a conversation with an image and confirm the **actual WhatsApp image** displays inside Inbox, can open in new tab, and is not the bot's image analysis. Confirm HTTP 200, `Content-Type: image/...`, `Cache-Control: private, no-store`.
- [ ] Find a conversation with a voice note and **press Play**. Confirm native player plays a real sound, no transcript/AI analysis is displayed, browser network returns an actual `audio/...` MIME and supports HTTP 200/206 (Range).
- [ ] Confirm protected URL is short-lived and forged signatures / unauthenticated access fail without exposing origin media secrets. Do not post signed URLs into bug reports.
- [ ] Confirm the Preview compose section visibly says **Read-only** and cannot send/queue manual WhatsApp messages or mutate Orders.
- [ ] Inspect Inbox both desktop and narrow/mobile layouts; test recent and older messages, image/no-image and audio/no-audio fallbacks.
- [ ] Record human/browser approval **without screenshots containing customer names, numbers or media**.

### Preview-only Media Playback QA route

An authenticated, Preview-only `/media-review` page now appears in the sidebar as **Media Playback QA**. It is server-gated to `VERCEL_ENV=preview`, `CRM_READ_SOURCE=neon_shadow`, and `CRM_PREVIEW_DIRECT_READ=1`. It reads the same protected CRM snapshot as Inbox, but never sends messages or changes orders. It intentionally omits names, phone numbers, media IDs and signed URLs from the copyable report.

1. Open the protected Preview, pass Vercel Authentication and CRM login, then select **Media Playback QA** (or open `/media-review`).
2. Click **Start / refresh checks**. Review HTTP 206, audio/image MIME, cache-control, and the original picture's actual render status.
3. Press Play on the original voice note, listen, and click **Confirm you heard the audio** only if the sound is genuinely audible. If not, use **Test next voice note** and record which status failed.
4. Click **Copy safe QA results** and share only that report. Do **not** share screenshots of customers' media, signed links, CRM cookies or passwords.
5. Mark Gate A complete only when the actual browser confirms both picture display and audible sound, with secure HTTP tests passing.

The dedicated page was created because the connected Vercel credential cannot access the protected team `mohamedbayads-projects` (HTTP 403), even though public metadata/deployments are sometimes readable. The Vercel connection must be authorized to that team before browser automation can be trusted. Do not relax deployment authentication to work around this.

- [ ] Complete [Inbox & Orders QA](/acceptance-review) on signed-in feature Preview, including automated aggregate checks and human confirmations for Inbox, Orders and Dashboard. See `scripts/INBOX_ORDERS_QA_README.md`.

## Gate B: Backup-only data & security review — NOT AUTHORIZED FOR MAIN

- [ ] Review and approve `scripts/archive-backup-leases.sql`, `scripts/archive-backup-leased-finalize.sql` and `scripts/archive-backup-finalize-function.sql` for Main, including object key uniqueness, lease fencing, transactional ledger and database privileges. Do not copy QA-specific function fixtures to Main.
- [ ] Create a verified Neon branch/snapshot of Main immediately before migrations; confirm rollback works, and classify the process for private archive object retention/access.
- [ ] Validate a clean, *newly initialized* isolated database restore from S3 archive metadata. QA **table-only import** already passed; this is not full disaster recovery.
- [ ] Execute extended parallel claim + stale-token rejection tests under distinct database sessions and concurrent load. Current two-call duplicate check is encouraging but not a stress test.
- [ ] Confirm PDF/document rows lacking original media identifiers are treated only as metadata; do not promise binary backup of these items.
- [ ] Confirm safe handling of unfinished `pending` archive ledger rows, retry limits, no duplicate writes, and no object reupload to previous lease key.
- [ ] Verify private S3 archive namespace and least-privilege storage key, `Content-Type`, archive checksums and restoration access.
- [ ] Ensure **all** archive workers retain no WhatsApp sending nodes and **no deletion** of `messages`, `orders`, `media_objects` or original WhatsApp media.

## Gate C: Release decision — EXPLICIT APPROVAL REQUIRED

These are **separate releases**. Do not combine them automatically:

1. Merge and deploy the CRM Preview improvements to Main/Production **only after Gate A passes** and the owner approves that deploy.
2. Deploy reviewed Main archive schema/DB functions **only after Gate B and a documented backup/rollback rehearsal**, with explicit approval.
3. Activate the **Production backup-only** workflow in a separate operation, once Main DB/schema/credentials and S3 paths have been confirmed. This phase may change `dry_run` after approval **only if both deletion switches remain `false` and Orders are preserved**.
4. **Do not enable text/media purge.** Removal of any 15-day-old messages requires a separate fully verified retention plan, archive restore acceptance, explicit owner authorization and order/media safety review.

## Gate D: Post-release observations, rollback

- Verify no WhatsApp sends were unintentionally triggered, no duplicate Orders or messages, no missing Inbox media, and no increase in `/api/media` 403/502 or S3 checksum failures.
- During backup-only rollout check new archive rows have unique UUID S3 keys, positive compressed byte sizes, verified SHA-256 and complete `archived_message_keys` per snapshot; original message/order/media row counts must not decrease because of backup.
- **Rollback order:** first disable/stop backup workflow; restore `archive_settings.dry_run=true`; inspect pending reservations; revert code deployment only through Vercel's normal rollback after approval; reverse SQL view/migrations only with verified backup and reviewed steps.
- Keep S3 objects and archived ledgers intact during rollback unless separately authorized. **No destructive cleanup, no unreviewed Main database writes.**

## Rollout decision at this checkpoint

**NO-GO** pending manual Inbox/Orders/Dashboard/mobile/read-only browser acceptance and explicit owner release approval. Authenticated original image/audio playback is already user-confirmed, and authenticated aggregate Inbox/Orders QA is PASS (46 conversations, 431 filtered messages, 12 orders, 0 duplicates, 0 unlinked, 0 callbacks). All five manual acceptance flags remain false (`overall_acceptance=false`). Backup-only activation additionally requires Gate B and independent approval. QA milestones are documented in `scripts/ARCHIVE_BACKUP_README.md` and `scripts/FINAL_INBOX_ORDERS_QA.md`.
