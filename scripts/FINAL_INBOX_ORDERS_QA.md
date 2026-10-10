# Sanureva CRM — Final Inbox & Orders QA checkpoint

Status: **PARTIAL PASS / NO PRODUCTION MERGE**. Assessed 2026-10-10. These are aggregate, PII-free database findings, not a signed-in browser walkthrough.

## Main Neon aggregate audit

- Conversations: **46**
- Raw messages: **447**; 431 have a valid conversation link, 16 have no conversation ID.
- All **16 unassigned records** have delivery statuses in `read/delivered/sent/failed`, no message text, caption or content snippet, no inbound/outbound direction, no order association and no media type; they are consistent with status callbacks and **must not be treated as lost customer messages without further evidence**.
- 0 messages with a non-null conversation ID that does not exist in `conversations`.
- Orders: **12**, 0 duplicate order IDs.
- Archive policy: `dry_run=true`, `preserve_orders=true`, `allow_message_delete=false`, `allow_media_delete=false`.

The Preview-only older Neon QA branch `br-round-river-b7vm8gey` holds a **stale historical snapshot**: 33 conversations, 332 raw messages, 11 orders; 15 null conversation IDs and 6 non-null IDs not present in its conversation table. **Do not use its raw counts to assert current Main parity or declare data loss**. This branch is not the Production data source.

## Source-contract caveat

`lib/neon-snapshot.ts` intentionally filters WhatsApp status-only callbacks before returning Inbox messages. `app/api/neon-review-summary/route.ts` and `app/api/neon-page-qa/route.ts` assess the *filtered snapshot*, not all rows in `public.messages`. Therefore, raw `conversation_id IS NULL` totals are not a valid substitute for actual Inbox unlinked-message QA.

The latest browser `/media-review` report (provided by the user) confirms 1 original image and 1 voice note played with correct 206/MIME/no-store, from 1 image and 33 available audio links. **Audio/image playback sub-gate PASSED; other Inbox and Orders gates remain open.**

## Remaining browser acceptance

- [ ] Open the latest authenticated feature Preview Dashboard/Inbox/Orders; verify counts and no duplicate Orders displayed.
- [ ] Spot-check real conversations and their original image/voice-note bubbles in the normal Inbox (the dedicated media QA page already passed).
- [ ] Verify source status callbacks are not rendered as customer text or duplicated chat bubbles.
- [ ] Confirm Preview composer cannot send WhatsApp messages or update order statuses.
- [ ] Check Inbox mobile layout and loading states.
- [ ] Confirm auth-negative access returns 401/403 rather than exposing orders or conversation details.

Do not merge PR #2, change Main database schema, turn off archive dry-run, or activate backup-only scheduling without explicit release authorization. Customer messages/media/orders must never be purged through this release.
