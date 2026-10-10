-- QA ISOLATION ONLY. Install on branch br-mute-snow-b7eqhu6o, NEVER Main.
-- Only synthetic conversation TEST-ARCH-LEASE-NEW, all objects under qa/conversations/.
-- Backup-only; no deletes, no WhatsApp sending. Keep QA dry_run=true until manual E2E.

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
 IF NOT EXISTS (SELECT 1 FROM public.conversations
   WHERE conversation_id='TEST-ARCH-LEASE-NEW'
     AND customer_phone='QA-LEASE-NONPHONE-20261010')
 THEN RAISE EXCEPTION 'QA synthetic fixture missing'; END IF;
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
 WHERE a.conversation_id='TEST-ARCH-LEASE-NEW'
   AND a.customer_phone='QA-LEASE-NONPHONE-20261010'
   AND a.status IN ('pending','failed') AND a.retry_count < 3
   AND (a.lease_expires_at IS NULL OR a.lease_expires_at < now())
   AND public.sanureva_archive_resumable(a.archive_id)
 ORDER BY a.created_at,a.archive_id
 FOR UPDATE OF a SKIP LOCKED LIMIT 1;
 IF FOUND THEN
   new_lease:=gen_random_uuid();
   UPDATE public.conversation_archives a
   SET lease_token=new_lease,
       lease_expires_at=now()+make_interval(mins=>p_lease_minutes),
       archive_key='qa/conversations/'||snap.archive_id::text||'/'||new_lease::text||'.jsonl.gz',
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
 WHERE v.conversation_id='TEST-ARCH-LEASE-NEW'
   AND v.customer_phone='QA-LEASE-NONPHONE-20261010'
   AND NOT EXISTS (
   SELECT 1 FROM public.conversation_archives existing
   WHERE existing.conversation_id=v.conversation_id
     AND existing.last_activity_at=v.last_activity_at
 )
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
  'qa/conversations/'||new_archive::text||'/'||new_lease::text||'.jsonl.gz',
  'jsonl.gz',candidate.message_count::integer,candidate.media_count::integer,
  'pending',new_lease,now()+make_interval(mins=>p_lease_minutes))
 ON CONFLICT (conversation_id,last_activity_at) DO NOTHING
 RETURNING * INTO snap;
 IF NOT FOUND THEN RETURN; END IF;
 RETURN QUERY SELECT snap.archive_id,snap.lease_token,snap.archive_key,
    snap.conversation_id,snap.message_count,snap.media_count,false;
END $fn$;

CREATE OR REPLACE FUNCTION public.finalize_sanureva_leased_backup(
  p_archive_id uuid,
  p_lease_token uuid,
  p_sha256 text,
  p_compressed_bytes bigint,
  p_message_count integer
)
RETURNS TABLE (archive_id uuid, result_status text, registered_messages integer, verified boolean)
LANGUAGE plpgsql
SECURITY INVOKER
AS $function$
DECLARE
  snap public.conversation_archives%ROWTYPE;
  pol public.archive_settings%ROWTYPE;
  actual_activity timestamptz;
  actual_messages integer;
  actual_media integer;
  ledger_count integer;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.conversations
    WHERE conversation_id='TEST-ARCH-LEASE-NEW'
      AND customer_phone='QA-LEASE-NONPHONE-20261010')
  THEN RAISE EXCEPTION 'QA synthetic fixture missing'; END IF;
  SELECT * INTO pol FROM public.archive_settings WHERE id=1;
  IF NOT FOUND OR pol.dry_run OR NOT pol.preserve_orders OR
    pol.allow_message_delete OR pol.allow_media_delete OR pol.inactive_days < 15
  THEN RAISE EXCEPTION 'Unsafe archive policy';
  END IF;
  IF p_sha256 !~ '^[0-9a-f]{64}$' OR
     p_compressed_bytes IS NULL OR p_compressed_bytes <= 0 OR
     p_message_count IS NULL OR p_message_count < 1
  THEN RAISE EXCEPTION 'Invalid archive checksum, size or record count';
  END IF;
  SELECT * INTO snap FROM public.conversation_archives
  WHERE conversation_archives.archive_id = p_archive_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Archive reservation not found'; END IF;
  IF snap.conversation_id<>'TEST-ARCH-LEASE-NEW'
     OR snap.customer_phone<>'QA-LEASE-NONPHONE-20261010'
  THEN RAISE EXCEPTION 'QA synthetic conversation only'; END IF;
  IF p_lease_token IS NULL OR snap.lease_token IS DISTINCT FROM p_lease_token THEN
    RAISE EXCEPTION 'Archive lease token mismatch'; END IF;
  IF snap.archive_bucket <> 'sanureva-archives' OR
     snap.archive_key IS DISTINCT FROM
        ('qa/conversations/' || p_archive_id::text || '/' || p_lease_token::text || '.jsonl.gz') OR
     snap.archive_format <> 'jsonl.gz'
  THEN RAISE EXCEPTION 'Archive object identity mismatch'; END IF;

  SELECT greatest(
    coalesce(c.last_message_at,'1970-01-01'::timestamptz),
    coalesce(max(m.occurred_at),'1970-01-01'::timestamptz),
    coalesce(c.started_at,'1970-01-01'::timestamptz)),
    count(m.id)::int,
    count(m.id) FILTER (WHERE
      m.media_id IS NOT NULL OR
      lower(btrim(coalesce(m.message_kind,''))) IN ('image','audio','video','document') OR
      lower(btrim(coalesce(m.source_record->>'Media Kind',''))) IN ('image','audio','video','document') OR
      coalesce(m.source_record->>'Message Content Snippet','') ~
        '\[\[WA_MEDIA:(image|audio|video|document):[0-9]{8,30}\]\]'
    )::int
  INTO actual_activity,actual_messages,actual_media
  FROM public.conversations c
  LEFT JOIN public.messages m ON m.conversation_id=c.conversation_id
  WHERE c.conversation_id=snap.conversation_id AND c.customer_phone=snap.customer_phone
  GROUP BY c.last_message_at,c.started_at;
  IF actual_activity IS NULL OR actual_activity <> snap.last_activity_at OR
     actual_activity >= now()-make_interval(days=>pol.inactive_days) OR
     actual_messages <> snap.message_count OR
     actual_messages <> p_message_count OR
     actual_media <> snap.media_count
  THEN RAISE EXCEPTION 'Conversation changed or no longer eligible'; END IF;

  IF EXISTS (SELECT 1 FROM public.orders o
     WHERE o.customer_phone=snap.customer_phone AND
     lower(btrim(coalesce(o.woocommerce_status,''))) IN
     ('pending','pending payment','processing','on-hold','on hold','checkout-draft')
  ) OR EXISTS (SELECT 1 FROM public.whatsapp_outbox ob
     WHERE ob.phone=snap.customer_phone AND
     lower(btrim(coalesce(ob.status,''))) IN
     ('pending','queued','processing','sending','retry','waiting','in_progress')
  ) THEN RAISE EXCEPTION 'Open order or WhatsApp outbox blocks archive'; END IF;

  IF snap.status='verified' THEN
    SELECT count(*)::int INTO ledger_count FROM public.archived_message_keys
    WHERE archived_message_keys.archive_id=p_archive_id;
    IF snap.sha256<>p_sha256 OR snap.compressed_bytes<>p_compressed_bytes OR
       ledger_count<>snap.message_count
    THEN RAISE EXCEPTION 'Existing verified archive mismatch'; END IF;
    RETURN QUERY SELECT p_archive_id, 'already_verified'::text, ledger_count, true;
    RETURN;
  END IF;
  IF snap.status<>'pending' THEN RAISE EXCEPTION 'Archive not pending'; END IF;
  IF snap.lease_expires_at IS NULL OR snap.lease_expires_at<=now()
  THEN RAISE EXCEPTION 'Archive lease expired'; END IF;

  IF EXISTS (
    SELECT 1 FROM public.messages m
    JOIN public.archived_message_keys k ON
         k.message_id=m.id OR
         (m.whatsapp_wamid IS NOT NULL AND k.whatsapp_wamid=m.whatsapp_wamid) OR
         (m.legacy_message_id IS NOT NULL AND k.legacy_message_id=m.legacy_message_id)
    WHERE m.conversation_id=snap.conversation_id AND k.archive_id<>p_archive_id
  ) THEN RAISE EXCEPTION 'Message already belongs to another archive'; END IF;

  INSERT INTO public.archived_message_keys
    (message_id,archive_id,whatsapp_wamid,legacy_message_id)
  SELECT m.id,p_archive_id,m.whatsapp_wamid,m.legacy_message_id
  FROM public.messages m WHERE m.conversation_id=snap.conversation_id
  ON CONFLICT (message_id) DO NOTHING;
  SELECT count(*)::int INTO ledger_count FROM public.archived_message_keys
  WHERE archived_message_keys.archive_id=p_archive_id;
  IF ledger_count<>snap.message_count THEN
    RAISE EXCEPTION 'Incomplete archived message ledger';
  END IF;

  UPDATE public.conversation_archives SET
    sha256=p_sha256,
    compressed_bytes=p_compressed_bytes,
    status='verified',
    lease_expires_at=NULL,
    uploaded_at=coalesce(uploaded_at,now()),
    verified_at=now(),
    updated_at=now()
  WHERE conversation_archives.archive_id=p_archive_id AND status='pending';
  RETURN QUERY SELECT p_archive_id,'verified'::text,ledger_count,true;
END
$function$;
