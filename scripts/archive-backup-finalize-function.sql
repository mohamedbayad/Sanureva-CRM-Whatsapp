-- Feature-branch migration: apply only after isolated QA approval.
-- Deliberately does not delete or update customer messages, media, or orders.
-- Verifies live inactivity and blockers, then atomically logs message keys and
-- marks an existing, S3-verified backup snapshot as verified.
CREATE OR REPLACE FUNCTION public.finalize_sanureva_backup(
  p_archive_id uuid,
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
  IF snap.archive_bucket <> 'sanureva-archives' OR
     snap.archive_key IS DISTINCT FROM
        ('conversations/' || p_archive_id::text || '.jsonl.gz') OR
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
    uploaded_at=coalesce(uploaded_at,now()),
    verified_at=now(),
    updated_at=now()
  WHERE conversation_archives.archive_id=p_archive_id AND status='pending';
  RETURN QUERY SELECT p_archive_id,'verified'::text,ledger_count,true;
END
$function$;
