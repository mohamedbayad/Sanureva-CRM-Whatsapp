-- QA-first migration: unique lease per attempt, immutable per-attempt S3 object keys.
-- Never install on main until isolated end-to-end S3 + restore QA succeeds.
-- This migration does not delete customer data or enable backup scheduling.
ALTER TABLE public.conversation_archives
  ADD COLUMN IF NOT EXISTS lease_token uuid,
  ADD COLUMN IF NOT EXISTS lease_expires_at timestamptz;

CREATE OR REPLACE FUNCTION public.sanureva_archive_resumable(p_archive_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER AS $fn$
 SELECT coalesce((
  SELECT
    a.status IN ('pending','failed')
    AND a.retry_count < 3
    AND c.customer_phone=a.customer_phone
    AND greatest(coalesce(c.last_message_at,'1970-01-01'::timestamptz),
                 coalesce(c.started_at,'1970-01-01'::timestamptz),
                 coalesce(m.latest_message,'1970-01-01'::timestamptz))=a.last_activity_at
    AND a.last_activity_at < now()-make_interval(days=>p.inactive_days)
    AND m.total=a.message_count AND m.media_total=a.media_count
    AND NOT EXISTS (SELECT 1 FROM public.orders o WHERE o.customer_phone=a.customer_phone
      AND lower(btrim(coalesce(o.woocommerce_status,''))) IN ('pending','pending payment','processing','on-hold','on hold','checkout-draft'))
    AND NOT EXISTS (SELECT 1 FROM public.whatsapp_outbox ob WHERE ob.phone=a.customer_phone
      AND lower(btrim(coalesce(ob.status,''))) IN ('pending','queued','processing','sending','retry','waiting','in_progress'))
  FROM public.conversation_archives a
  JOIN public.conversations c ON c.conversation_id=a.conversation_id
  CROSS JOIN public.archive_settings p
  CROSS JOIN LATERAL (
   SELECT count(*)::int total,max(mm.occurred_at) latest_message,
   count(*) FILTER (WHERE
     mm.media_id IS NOT NULL OR
     lower(btrim(coalesce(mm.message_kind,''))) IN ('image','audio','video','document') OR
     lower(btrim(coalesce(mm.source_record->>'Media Kind',''))) IN ('image','audio','video','document') OR
     coalesce(mm.source_record->>'Message Content Snippet','') ~ '\[\[WA_MEDIA:(image|audio|video|document):[0-9]{8,30}\]\]'
   )::int media_total
   FROM public.messages mm WHERE mm.conversation_id=a.conversation_id
  ) m
  WHERE p.id=1 AND NOT p.dry_run AND p.preserve_orders
    AND NOT p.allow_message_delete AND NOT p.allow_media_delete
    AND p.inactive_days >= 15 AND a.archive_id=p_archive_id
 ),false);
$fn$;

CREATE OR REPLACE FUNCTION public.claim_sanureva_backup(p_lease_minutes integer DEFAULT 15)
RETURNS TABLE (
  claimed_archive_id uuid,
  claimed_lease_token uuid,
  claimed_archive_key text,
  claimed_conversation_id text,
  claimed_message_count integer,
  claimed_media_count integer,
  resumed boolean
)
LANGUAGE plpgsql SECURITY INVOKER AS $fn$
DECLARE
  snap public.conversation_archives%ROWTYPE;
  candidate record;
  new_lease uuid;
  new_archive uuid;
BEGIN
 IF p_lease_minutes < 6 OR p_lease_minutes > 30 THEN
   RAISE EXCEPTION 'Lease duration outside 6-30 minute limits';
 END IF;
 IF NOT EXISTS (SELECT 1 FROM public.archive_settings
                WHERE id=1 AND NOT dry_run AND preserve_orders
                AND NOT allow_message_delete AND NOT allow_media_delete
                AND inactive_days>=15)
 THEN RAISE EXCEPTION 'Backup-only policy inactive'; END IF;

 -- Choose at most one previously interrupted attempt. Lock this reservation
 -- for the duration of this transaction; other workers SKIP LOCKED.
 SELECT a.* INTO snap
 FROM public.conversation_archives a
 WHERE a.status IN ('pending','failed') AND a.retry_count < 3
   AND (a.lease_expires_at IS NULL OR a.lease_expires_at < now())
   AND public.sanureva_archive_resumable(a.archive_id)
 ORDER BY a.created_at,a.archive_id
 FOR UPDATE OF a SKIP LOCKED LIMIT 1;
 IF FOUND THEN
   new_lease:=gen_random_uuid();
   UPDATE public.conversation_archives a
   SET lease_token=new_lease,
       lease_expires_at=now()+make_interval(mins=>p_lease_minutes),
       archive_key='conversations/'||snap.archive_id::text||'/'||new_lease::text||'.jsonl.gz',
       retry_count=a.retry_count+1,
       status='pending',
       last_error=NULL,
       updated_at=now()
   WHERE a.archive_id=snap.archive_id
   RETURNING a.* INTO snap;
   RETURN QUERY SELECT snap.archive_id,snap.lease_token,snap.archive_key,
      snap.conversation_id,snap.message_count,snap.media_count,true;
   RETURN;
 END IF;

 -- New snapshot: unique (conversation,last_activity) already enforced.
 -- Two concurrent claimers cannot reserve the same conversation.
 SELECT v.* INTO candidate FROM public.archive_candidates_preview v
 ORDER BY v.last_activity_at,v.conversation_id LIMIT 1;
 IF NOT FOUND THEN RETURN; END IF;
 new_archive:=gen_random_uuid();
 new_lease:=gen_random_uuid();
 INSERT INTO public.conversation_archives
 (archive_id,conversation_id,customer_phone,last_activity_at,archive_bucket,
  archive_key,archive_format,message_count,media_count,status,lease_token,lease_expires_at)
 VALUES
 (new_archive,candidate.conversation_id,candidate.customer_phone,
  candidate.last_activity_at,'sanureva-archives',
  'conversations/'||new_archive::text||'/'||new_lease::text||'.jsonl.gz',
  'jsonl.gz',candidate.message_count::integer,candidate.media_count::integer,
  'pending',new_lease,now()+make_interval(mins=>p_lease_minutes))
 ON CONFLICT (conversation_id,last_activity_at) DO NOTHING
 RETURNING * INTO snap;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY SELECT snap.archive_id,snap.lease_token,snap.archive_key,
    snap.conversation_id,snap.message_count,snap.media_count,false;
END $fn$;
