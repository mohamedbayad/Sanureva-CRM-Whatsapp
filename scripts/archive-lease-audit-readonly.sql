-- Read-only QA audit. No customer identifiers or message content returned.
WITH policy AS (
 SELECT id,dry_run,preserve_orders,allow_message_delete,allow_media_delete,inactive_days
 FROM public.archive_settings WHERE id=1
), reservations AS (
 SELECT count(*)::int total,
 count(*) FILTER (WHERE status IN ('pending','failed') AND retry_count<3 AND
 (lease_expires_at IS NULL OR lease_expires_at<now()))::int retryable,
 count(*) FILTER (WHERE status IN ('pending','failed') AND retry_count>=3)::int exhausted,
 count(*) FILTER (WHERE lease_token IS NOT NULL AND archive_key <>
 ('conversations/'||archive_id::text||'/'||lease_token::text||'.jsonl.gz'))::int mismatched_keys,
 count(*) FILTER (WHERE status='pending' AND lease_expires_at>now())::int active_leases
 FROM public.conversation_archives
), verified AS (
 SELECT count(*)::int verified_count,
 count(*) FILTER (WHERE status='verified' AND
 (sha256 IS NULL OR compressed_bytes IS NULL OR verified_at IS NULL))::int incomplete_verified_metadata
 FROM public.conversation_archives
), fns AS (
 SELECT pg_get_functiondef('public.claim_sanureva_backup(integer)'::regprocedure) AS claim_definition,
 pg_get_functiondef('public.finalize_sanureva_leased_backup(uuid,uuid,text,bigint,integer)'::regprocedure) AS finalize_definition
)
SELECT (p.dry_run AND p.preserve_orders AND NOT p.allow_message_delete AND NOT p.allow_media_delete AND p.inactive_days>=15) AS policy_locked,
 (SELECT count(*)::int FROM public.archive_candidates_preview) AS new_eligible_conversations,
 r.total AS archive_records,r.retryable,r.exhausted,r.active_leases,
 r.mismatched_keys,
 v.verified_count,v.incomplete_verified_metadata,
 (f.claim_definition LIKE '%FOR UPDATE OF a SKIP LOCKED%') AS uses_row_lock,
 (f.claim_definition LIKE '%WHERE NOT EXISTS (%') AS excludes_existing_snapshots,
 (f.finalize_definition LIKE '%Archive lease token mismatch%') AS fences_stale_tokens,
 (f.finalize_definition LIKE '%Archive lease expired%') AS checks_lease_expiry,
 (SELECT count(*)::int FROM public.archived_message_keys) AS archived_key_count
 FROM policy p CROSS JOIN reservations r CROSS JOIN verified v CROSS JOIN fns f;