# Sanureva CRM + n8n implementation readiness — 22 Oct 2026

## Operating rule
**Do not publish any n8n draft, merge PR #19, enable new webhooks, or send real customer messages without separate production approval.** All implementation changes described here are staged.

## Confirmed inventory
- 24 Sanureva-named n8n workflows (9 active at audit time), plus 1 unrelated workflow in the instance.
- The active backup workflow is named `15-day Conversation Backup ONLY (INACTIVE)`: a naming/configuration discrepancy. **Do not unpublish it** until its operational role is confirmed.
- The primary WhatsApp agent contains 167 nodes. Audit and grouping should proceed conservatively because legacy and V2 components share connections.
- The CRM API Gateway reads six Google Sheets ranges per snapshot. CRM polling defaults to ~30 seconds per visible tab. There are also scheduled Outbox and Sheets-to-Neon jobs. Google Sheets HTTP 429s were previously observed; do not claim the quota is permanently solved.

## Prepared — n8n drafts, not published
- **Woo Order Confirmation** (`EkV7gaTyLcOwPfig`): independent Google Sheets append-or-update by Order ID and Neon PostgreSQL upsert by Order ID, fed directly from Woo create/update webhooks. These branches do not depend on WhatsApp template or agent-ready-product eligibility.
- The Neon upsert preserves WhatsApp/delivery/confirmation columns and uses bounded retry attempts.
- **Sheets-to-Neon Safe Sync** (`BY8mR5uW5St13Qlz`): a product-upsert parameter-expression correction is staged in draft.
- Both workflows retain their previous, different published versions.

## Prepared — CRM PR #19, not merged
- Inline WhatsApp sent/delivered/read/failed indicators in Inbox, based on actual WhatsApp status callbacks rather than inference.
- A read-only Neon direct-Woo order adapter with merge-by-Order-ID for the Orders page. It preserves existing confirmation state and avoids duplicate display.
- When n8n CRM snapshot reads fail, a read-only Neon mirror is available as a fallback (subject to data freshness and connection).
- A **per-server-instance** read-only snapshot singleflight reduces concurrent Sheets requests. Cache duration: max 10 seconds for ordinary snapshots, max 2 seconds for fallback. This is not a cross-instance/global cache.
- Preview has no customer send access. Session verification remains enforced upstream of snapshot reads.
- The PR currently passes the Product Knowledge build and Neon Snapshot PR Validation CI workflows.

## Completed QA evidence
1. Synthetic order inserted into an isolated Neon QA branch with its own test ID.
2. Second upsert with the same order ID updated Woo status and amount without creating a second row.
3. Existing WhatsApp `read`, delivery `delivered`, confirmation flags, and reminder count were preserved.
4. Running the Sheets-to-Neon synchronization function on the isolated branch retained the synthetic order and those statuses.
5. Synthetic UI regression checks cover new order without WhatsApp, deduplicated Order ID, preserved confirmation state, Preview no-send controls, and the Neon fallback mapping.
6. Synthetic cache tests cover concurrent coalescing, 10-second expiry, retry after a rejected load, and short fallback TTL. CI completed successfully on commit `ab4aff041b2516dc25cc735625646ba8c368be3a`.

**Limits of evidence:** These are isolated/synthetic tests. They are not proof that all historical WooCommerce orders are present; a live Woo↔CRM reconciliation is still required. Nor is this an end-to-end real customer/WhatsApp acceptance run.

## Remaining before release
1. Compare authoritative WooCommerce orders with Neon and CRM Orders by exact Woo order ID. Report missing IDs and status mismatches without sending templates.
2. Test Woo webhook payload differences (order created and updated, missing customer phone, cancelled/refunded, invalid/duplicate event, the two promotional quantity tiers), on isolated data only.
3. Verify n8n's two newly added branches with pinned/simulated node data and no external writes; verify their published versions remain unchanged.
4. Verify WhatsApp Inbox ticks for each status and order state, including missing WAMIDs, failed media sends, and callbacks received out of order.
5. Check n8n retry/error alert pathways and quantify Google Sheets API consumption after the 10-second cache change.
6. Investigate candidate duplicate/one-time/QA workflows; never delete, archive, or unpublish a workflow solely because its name is similar.
7. Validate CI and Preview one last time after any amendments, take a backup/rollback snapshot, then ask for explicit production rollout authorization.

## Release gates
- All CI/build/acceptance checks green on the exact merge commit.
- No missing Woo orders in a complete scoped comparison; zero new duplicated orders from webhook retries.
- No WhatsApp sends from Preview/tests.
- Confirmation status truth preserved; `sent` never shown as `read` without an actual callback.
- Measured performance and a documented rollback to the previous published workflow versions.
- **Separate explicit approval for production.**

## References
- CRM: https://github.com/mohamedbayad/Sanureva-CRM-Whatsapp/pull/19
- Woo workflow: https://n8n-dhhy.srv1952669.hstgr.cloud/workflow/EkV7gaTyLcOwPfig
- Sheets-to-Neon: https://n8n-dhhy.srv1952669.hstgr.cloud/workflow/BY8mR5uW5St13Qlz
