# CRM Production Release Preflight — 2026-10-10

**Decision: READY FOR OWNER RELEASE REVIEW, NOT DEPLOYED.**  
PR #2 is open and Draft, **121 commits / 48 changed files** at this checkpoint. This document is not authorization to merge, migrate the database, or activate a backup worker.

## Confirmed readiness

- Protected feature Preview READY, user browser acceptance **overall_acceptance=true**.
- User tested Inbox, Orders, Dashboard, mobile, read-only/auth behavior and original image/audio playback.
- 46 conversations, 431 filtered chat messages, 12 orders, 0 linked-message failures, 0 duplicate order IDs, 0 status callbacks shown.
- Current feature CI passed for TypeScript, Next.js build, media handler, Inbox/Orders, and archive lease tests; a production-mode regression suite was added afterward and must pass before release.
- Last deployed Production Git SHA `2ee9a946e4626adca3a7a2dcd8cae7711942d0ce` is READY and matches Main.
- Main Neon: `dry_run=true`, `preserve_orders=true`, `allow_message_delete=false`, `allow_media_delete=false`, zero archives/keys. 15-day archive worker inactive.

## Critical environment distinction

The Vercel environment metadata confirms `CRM_READ_SOURCE`, `CRM_PREVIEW_DIRECT_READ`, `DATABASE_URL`, `CRM_PREVIEW_SESSION_SECRET`, `CRM_REVIEW_PASSWORD`, `N8N_MEDIA_READ_KEY`, `N8N_MEDIA_READ_WEBHOOK_URL` and the relevant public Preview flags are restricted to the **feature branch Preview**. Existing production settings include `CRM_DASHBOARD_PASSWORD`, `N8N_CRM_WEBHOOK_URL` and `N8N_CRM_API_KEY`, and not `CRM_READ_SOURCE`.

Therefore merging the PR into `main` under the current Production configuration will **NOT switch Production to direct Neon reads**. The Production CRM should continue to use the existing n8n-backed data reader, original WhatsApp outbound queue and existing `get_media` gateway, while receiving common code updates. The feature Preview's protected Neon-only review pages are gated to Preview and should 404 in Production.

**Never copy Preview DB credentials or a Preview media key to Production to force a Neon switch.** A separate Production data-source migration needs its own plan and approval.

## Release review / hold points

1. [x] Feature Preview has full user-confirmed browser acceptance.
2. [x] Safe branch-scoped environment separation verified without viewing secret values.
3. [ ] Pass new Production-path regression suite `scripts/production-mode-compat.test.mjs` and latest full CI.
4. [ ] Decide whether this release is **code-only with Production remaining n8n** or a separately authorized Neon data cutover. Do not conflate them.
5. [ ] Owner explicitly authorizes **Merge PR #2 + Production deploy**.
6. [ ] Ensure accountable access to Vercel team and a rollback operator. Prior Vercel connector tests encountered 403 against protected team; listing public deployment metadata is not proof of privileged deploy/rollback access.
7. [ ] After approval, merge PR and observe Production rollout; confirm CRM login, Inbox, Orders, Dashboard, and send/WhatsApp API with test-only permitted operations; avoid sending unsolicited customer messages.
8. [ ] Immediately revert to previous READY Production deployment SHA above if critical regression confirmed; preserve database and media.
9. [ ] Keep database archiving and 15-day retention on a **separate** release gate. Do not turn off Main `dry_run`. Absolutely no message/media/order purge.

The PR currently includes archive SQL as **versioned files only**. Git merge itself does not execute those SQL scripts or publish n8n workflows; do not run them on Main as part of CRM release.

## Rollout status

**Not executed:** No PR merge, Main database migration, archive worker activation, env target change, credential rotation, WhatsApp send, delete or Production redeploy requested/performed by this preflight.
