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

## Protected in-browser acceptance tool

The feature branch includes an **authenticated Preview-only** `/acceptance-review` page, linked as **Inbox & Orders QA** in the Preview sidebar. The page pulls `GET /api/neon-page-qa` and `GET /api/snapshot`, compares source/contract, distinct order IDs, conversation links, status-callback exclusion, finite Dashboard KPIs and consistent aggregate counts, and emits a PII-free JSON report. HTTP `409` data-quality check responses now show individual failed checks, rather than hiding the reason.

Human checks are deliberately separate and include Inbox rendering and no Send/Queue composer, Orders status and no edit controls, Dashboard metrics, **mobile Inbox layout**, and read-only/authenticated access. The operator must visit those real pages and mark them confirmed. These checkboxes do not modify CRM data, send WhatsApp messages, or authorize deployment.

Synthetic CI tests `scripts/inbox-orders-acceptance.test.mjs` and `scripts/inbox-orders-browser-acceptance.test.mjs` verify the actual components, Preview outbox POST denial (403 before sending), route protection and PII-free report. They are **not** an authenticated browser visit and cannot replace the user's acceptance JSON.

### Acceptance workflow

1. Sign in to latest protected Preview and open `/acceptance-review`.
2. Click **Run Inbox & Orders QA**. Review whether automatic aggregate checks pass; if not, share the safe report without customer identifiers.
3. Open each linked page (Inbox, Orders, Dashboard) including mobile layout, confirm correct UI and no send/edit controls; test unsigned-in access separately.
4. Complete checkboxes only for verified behaviors and click **Copy safe QA report**.
5. Do not merge PR #2, switch Main archive dry-run or activate backup until all release gates pass and the owner explicitly approves that action.


## User-provided protected Preview acceptance report — 2026-10-10

A PII-free JSON report was supplied from the authenticated `/acceptance-review` tool. **Automated aggregate checks: PASS; overall manual acceptance: NOT YET COMPLETE.**

- `automated_pass=true`, `source_neon=true`, `contract_ok=true`, `summary_counts_consistent=true`.
- Displayed snapshot: **46 conversations, 431 filtered messages, 12 orders**.
- `orders_unique=true`, `duplicate_orders=0`; `messages_linked=true`, `unlinked=0`; `callbacks_excluded=true`, `status_callbacks_visible=0`.
- `metrics_valid=true`, `no_page_qa_writes=true`.
- `manual_inbox_confirmed=false`, `manual_orders_confirmed=false`, `manual_dashboard_confirmed=false`, `manual_mobile_confirmed=false`, `manual_read_only_security_confirmed=false`; **`overall_acceptance=false`**.

The 431 displayed messages are the filtered chat messages. There were 447 raw Main Neon records at the preceding audit, including 16 legacy delivery/status-only callback records correctly omitted from Inbox. The submitted report proves the **aggregate validation** passed in the signed-in Preview, not that the real UI layout or negative authentication flow were manually checked. The prior separate Media Playback QA confirmed one real image and one audible voice note.

**Next step:** use the same Preview's `/acceptance-review` links to manually verify Inbox, Orders, Dashboard, mobile layout and read-only/unsigned-in access, check only items genuinely inspected, and share the new PII-free report. Do not merge, activate automatic backup, or authorize deletion based solely on automatic PASS.


## FINAL user-confirmed CRM Preview acceptance — 2026-10-10

The user submitted a second PII-free JSON report from the authenticated `/acceptance-review` page. **Overall CRM Preview acceptance: PASS.**

- `automated_pass=true`, `overall_acceptance=true`.
- Source Neon, snapshot contract, unique orders, linked messages, filtered callbacks, Dashboard KPIs, read-only page QA and aggregate parity: all true.
- **46 conversations, 431 displayed chat messages, 12 Orders, 0 unlinked, 0 duplicate order IDs and 0 delivery-status-only callbacks rendered**.
- All **5/5 manual checks confirmed by the user**: `manual_inbox_confirmed`, `manual_orders_confirmed`, `manual_dashboard_confirmed`, `manual_mobile_confirmed`, and `manual_read_only_security_confirmed` are true.
- Prior separate authenticated `/media-review` evidence: original image rendered; original audio decoded, started and audibly confirmed.

**Gate A: PASS (user-verified).** This is acceptance of the feature Preview, **not** a separate instruction/authorization to merge PR #2, deploy Main/Production, run Main archive migrations, or activate backups. Maintain the independent Gate B and release-approval hold. Message/media deletion remains prohibited in this phase.
