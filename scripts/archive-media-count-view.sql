-- Sanureva CRM / Neon archive media count correction.
-- Read-only view definition change: no customer rows, orders, or media are modified.
-- The archive worker remains inactive and deletion switches remain disabled.
-- Counts each message once even when its media is represented both by an
-- embedded WhatsApp media marker and by a media UUID.
CREATE OR REPLACE VIEW public.archive_candidates_preview AS
WITH latest AS (
  SELECT
    c.conversation_id,
    c.customer_phone,
    GREATEST(
      COALESCE(c.last_message_at, '1970-01-01'::timestamptz),
      COALESCE(MAX(m.occurred_at), '1970-01-01'::timestamptz),
      COALESCE(c.started_at, '1970-01-01'::timestamptz)
    ) AS last_activity_at,
    COUNT(m.id) AS message_count,
    COUNT(m.id) FILTER (
      WHERE m.media_id IS NOT NULL
         OR lower(btrim(COALESCE(m.message_kind, '')))
           IN ('image', 'audio', 'video', 'document')
         OR lower(btrim(COALESCE(m.source_record->>'Media Kind', '')))
           IN ('image', 'audio', 'video', 'document')
         OR COALESCE(m.source_record->>'Message Content Snippet', '')
           ~ '\\[\\[WA_MEDIA:(image|audio|video|document):[0-9]{8,30}\\]\\]'
    ) AS media_count
  FROM public.conversations c
  LEFT JOIN public.messages m ON m.conversation_id = c.conversation_id
  GROUP BY c.conversation_id, c.customer_phone,
           c.last_message_at, c.started_at
)
SELECT
  x.conversation_id,
  x.customer_phone,
  x.last_activity_at,
  x.message_count,
  x.media_count
FROM latest x
CROSS JOIN public.archive_settings s
WHERE s.id = 1
  AND x.message_count > 0
  AND x.last_activity_at < NOW() - make_interval(days => s.inactive_days)
  AND NOT EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.customer_phone = x.customer_phone
      AND lower(btrim(COALESCE(o.woocommerce_status, ''))) IN (
        'pending', 'pending payment', 'processing',
        'on-hold', 'on hold', 'checkout-draft'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.whatsapp_outbox ob
    WHERE ob.phone = x.customer_phone
      AND lower(btrim(COALESCE(ob.status, ''))) IN (
        'pending', 'queued', 'processing', 'sending',
        'retry', 'waiting', 'in_progress'
      )
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.conversation_archives a
    WHERE a.conversation_id = x.conversation_id
      AND a.last_activity_at = x.last_activity_at
      AND a.status IN (
        'pending', 'uploaded', 'verified', 'purging', 'completed'
      )
  );
