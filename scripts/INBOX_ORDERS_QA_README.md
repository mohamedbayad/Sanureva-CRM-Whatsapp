# Sanureva — Inbox & Orders Acceptance QA

**Checkpoint:** 2026-10-10. **Status:** automated tests PASS; human browser checks for Inbox, Orders and Dashboard PENDING. No merge or live backup activation.

## Automated evidence (no customer data written)

- Read-only Neon main aggregate SQL (SELECT only): **12 orders**, **46 conversations**, **447 raw messages** at the time of review. Of those messages **16** are historic status-only callbacks preserved in source data but suppressed from normal chats; **431** raw message records are not status-only. Zero orphaned/broken conversation links, zero duplicated Order IDs and zero missing Order IDs. Counts may change during the 15-minute Sheets/Neon synchronization. The CRM also includes one legacy bot-message display repair; do not compare source row counts to Inbox row counts without this transformation.
- `scripts/inbox-orders-acceptance.test.mjs` renders the actual Inbox and Orders TSX components with **synthetic** conversations, WhatsApp messages, and orders; checks that Preview hides the send composer, Orders are display-only, statuses are present, and status-only callbacks are filtered before chat rendering. Executes the actual `POST /api/outbox` handler in Preview mode with an in-memory fake n8n queue; confirms HTTP **403** and **zero** queued sends. Verifies session checks in `proxy.ts`.
- `scripts/inbox-orders-browser-acceptance.test.mjs` checks the server-gated Preview-only acceptance page, same-origin GET-only live diagnostics, aggregate metric and ID assertions, manually selected browser acceptance flags, PII-free report, and sidebar visibility.
- GitHub Actions [run 38094063349](https://github.com/mohamedbayad/Sanureva-CRM-Whatsapp/actions/runs/38094063349): **SUCCESS**, 12/12 new tests, TypeScript and Next.js build passing.
- Preview deployment `sanureva-crm-whatsapp-52uf7ba1d-mohamedbayads-projects.vercel.app` (feature commit `60b406e82e0f`) READY.

## Real browser acceptance (remaining)

1. Open [Inbox & Orders QA](https://sanureva-crm-whatsapp-52uf7ba1d-mohamedbayads-projects.vercel.app/acceptance-review) from a signed-in, Vercel-protected Preview browser.
2. Click **Run Inbox & Orders QA**. It fetches the same snapshot as Dashboard/Inbox/Orders and the read-only `/api/neon-page-qa` diagnostic. The copied JSON contains only aggregate counters and booleans, never phone numbers, customer names, message bodies, Order IDs, or media URLs.
3. Open **Inbox**, **Orders**, and **Dashboard** in separate tabs and manually verify rendering, statuses, counts, no send button, and no order-edit actions. Tick the three checkboxes only when personally confirmed.
4. Copy the safe JSON report and return it to this conversation. A user-confirmed media QA report has already verified one image and one audible voice note on the dedicated Preview page. Still check the ordinary Inbox view.
5. Do **not** use real WhatsApp test sends, change Order statuses, disable Vercel Authentication or modify any Production database row to validate Preview. Test APIs against in-memory mocks only.

## Release boundary

This report is acceptance evidence, not permission to merge PR #2 or enable automatic backups. `dry_run=true`, preserve Orders, and both deletion flags disabled. A **separate** reviewed and explicitly approved rollout is required for CRM code, then archive schema, then backup-only workflow. Text/media purge remains prohibited without distinct approval.
