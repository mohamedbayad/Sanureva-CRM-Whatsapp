# Sanureva — n8n + CRM Audit & Safe Implementation Plan
**Date:** 2026-10-22
**Scope:** Read-only production inspection; proposed work must be prepared and tested outside production.
**Deployment rule:** DO NOT publish/activate n8n changes, merge CRM changes into `main`, send real WhatsApp messages, or change customer orders without separate explicit approval.

## 1. Verified findings (production read only)
- n8n search returns **24 Sanureva workflows**, **9 active** (plus one unrelated active Instagram workflow). These are counts at audit time, not a deletion list.
- Main **Sanureva — WhatsApp Conversion & Order Confirmation Agent** is active and has **167 nodes**; modularity/readability improvement is warranted, but no node has yet been proven redundant.
- **Sanureva — Outbound WooCommerce Order Confirmation** is active. Its current graph goes from `Normalize Store Order` to `Fetch Agent-Ready Products` → `Eligible Store Order?` → reminder-state check → WhatsApp template send → Sheets confirmation message → **GS • Initial Order Upsert**. Therefore some order records can be skipped if the product is not agent-ready or the template fails. Attribution runs in a separate branch; it is NOT a substitute for reliable order intake.
- **Sanureva — CRM API Gateway** has real failed executions (including **65200**) with Google Sheets **HTTP 429 RESOURCE_EXHAUSTED**: `ReadRequestsPerMinutePerUser`, quota **60 reads/minute**. The failure was in `ATTR API • Read CRM Delivery Status` during `campaign_analytics`.
- **Sanureva — Sheets to Neon Safe Sync (15 min)** is active, with both a 15-minute Sheets sync and a separate 2-minute WooCommerce product fetch. It is not a real-time guarantee that all WooCommerce orders are present.
- A workflow named **Sanureva — 15-day Conversation Backup ONLY (INACTIVE)** is **active**. Name and actual activation disagree; inspect backup behavior and recovery coverage before touching it.
- Historical inactive workflows include Outbox formula installers, Outbox Auto-fill, read-only QA, and one-time resend. Similar names are NOT evidence of duplicated effects. Do not delete on names alone.
- GitHub CRM **PR #19** implements per-message WhatsApp status ticks with WAMID-based callback overlay and left-hand conversation preview. It is open/unmerged. Latest inspected PR-head GitHub checks passed, but production behavior and acceptance still require approval and validation.

## 2. Target architecture
```text
WooCommerce order.created / order.updated
       -> verify webhook authenticity + normalize data
       -> UPSERT canonical order in Neon (unique store + Woo order ID)
       -> enqueue confirmation task only when eligible
       -> WhatsApp send (separate failure domain) -> record attempt + WAMID
       -> delivery webhook events update status by exact WAMID
       -> CRM Orders: every Woo order / current status
       -> CRM Inbox: pending | sent | delivered | read | failed
Periodic WooCommerce reconciliation: Woo REST -> find missing/stale orders -> idempotent UPSERT + alert
Google Sheets: compatibility/secondary reporting, bounded batch sync—not a critical intake dependency
```

## 3. Implementation work packages — staging / feature branches first

### P0: Backup, inventory, reversible change control
1. Export **versioned and sanitized** workflow definitions (never export credential secrets into the repository). Record active vs draft version, triggers, side effects, frequency, webhook routes and n8n execution IDs.
2. Back up Neon schema/data and verify restore on a non-production branch/database. Document Vercel rollback commit and n8n workflow version rollback procedure.
3. Capture a baseline: WooCommerce order IDs/created_at/updated_at/status vs CRM order IDs, WhatsApp event samples, current Google Sheets read failures, successful send events.
4. Make a before/after table for every proposed node removal, confirming input/output and side effects. Deletions must happen only after controlled testing and a rollback path.

### P1: Correct WooCommerce -> CRM order intake (highest business priority)
1. Design a separate **order-ingest** workflow. Validate signed WooCommerce webhook, store ID, payload, order ID, timestamps, and required fields; reject duplicates safely.
2. Persist a canonical Neon order **before** message eligibility checks. Use database uniqueness `(store_id, woo_order_id)`, idempotent upsert, and last-update ordering. Do not hard-code the WhatsApp send state as order state.
3. Schedule the confirmation send independently. Distinguish `not_eligible`, `pending`, `accepted`, `failed`, `delivered`, `read`; record each attempt with its actual WhatsApp WAMID and error reason. Never auto-resend historical messages without a separate approved idempotent policy.
4. Add Woo REST reconciliation using cursor/watermark and overlap; compare all orders to CRM and backfill missing/updated records without triggering customer sends. Include cancelled/refunded orders in Orders view with their real status.
5. Audit both Woo webhooks and any agent-created Woo orders; prevent the same order appearing twice. Protect existing promotions (buy 2+1; buy 3+2) and do not mutate price/quantities during synchronization.

### P2: Remove Google Sheets quota pressure
1. Profile reads per route, especially CRM Gateway `campaign_analytics`; instrument 429 count and p95 execution latency.
2. Read once per request where possible; replace repeated sheet reads with a bounded cache or Neon read replica after parity. Batch related ranges and limit sync intervals/concurrency; add bounded retries with backoff/jitter for 429.
3. Keep a safe fallback when Neon is temporarily unavailable. Do not silently serve stale data as current WhatsApp delivery status.
4. Verify API read rate remains comfortably below the 60/minute observed per-user quota under synthetic load.

### P3: Organize and simplify n8n workflows
1. Visually arrange the 167-node WhatsApp workflow by groups: Trigger/Normalize → Identity/Knowledge → Sales skills/Decision → Order validation/actions → Message sender → CRM logging/errors/observability.
2. Compare repeated fetch/normalize blocks for semantic equivalence. Use reusable subflows only when webhook semantics, credentials, retries, observability and failure isolation are unchanged.
3. Name nodes consistently and add concise sticky notes for boundaries and failure paths. Clearly label one-time/QA tools; fix the misleading active `(INACTIVE)` backup name only after verifying its correct schedule.
4. Retain inactive one-off utilities until their dependencies and history are audited. No blanket deletion.

### P4: CRM Inbox message status UX (PR #19)
- Match **exact WhatsApp WAMID** to latest server callback. `accepted/queued/unknown` = clock; `sent` = one grey tick; `delivered` = two grey ticks; `read` = two blue ticks; `failed` = red alert. Never infer read/delivered from send API acceptance.
- Show status on outgoing message bubbles **and** left-hand conversation previews. Filter status-only callback records so they cannot become fake message bubbles.
- Test previews with synthetic inbound/outbound text, image and audio; verify failed retries remain distinct from successful attempts (order #3582 is a historical display regression case; **do not resend**).
- PR #19 must pass CI, browser acceptance, data parity, and human visual review before it is eligible to merge/deploy.

### P5: End-to-end staging tests, then separate go-live approval
**Required synthetic scenarios:** duplicate webhook; Woo order with ineligible product; WhatsApp provider 429/500 and delayed callbacks; valid/invalid WAMID; Woo edit/update/refund; 2+1 / 3+2 offers; Google Sheets 429; Neon temporary outage; audio and image; scheduled reminder with prior confirmation; no duplicate follow-up; order arriving while messaging service is offline.
**Exit criteria:** every checked Woo ID appears once in canonical CRM Orders; no real sends during staging; correct message ticks; no lost order on WhatsApp failure; safe retries; tested restore/rollback; observable errors and alerts; CI green; owner explicitly approves production deployment.

## 4. Controlled production rollout (not authorized yet)
1. Schedule rollback window, export/back up current active versions, log exact change set.
2. Enable order ingestion first with read-only parity comparison before enabling any independent sender behavior.
3. Roll out Inbox status display only after acceptance, then throttle/simplify reads, then modular workflow refactors.
4. Monitor order parity, delivery callbacks, 429 counts, queue age, and outgoing message count; rollback immediately on missing orders or duplicate sends.

## 5. What has NOT been done
- No workflow node deleted, deactivated or published by this audit.
- No production n8n, Neon, WooCommerce, Vercel, or WhatsApp configuration changed by this plan.
- No real customer message sent.
- No claim yet that all WooCommerce orders are present; a full Woo vs CRM ID reconciliation remains required.
- No permission for production rollout is implied by approval to prepare implementation and tests.
