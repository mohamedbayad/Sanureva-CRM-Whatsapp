-- Rollback of archive-media-count-view.sql.
-- Only restores the prior view definition. No customer data is modified.
CREATE OR REPLACE VIEW public.archive_candidates_preview AS
 WITH latest AS (
         SELECT c.conversation_id,
            c.customer_phone,
            GREATEST(COALESCE(c.last_message_at, '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(max(m.occurred_at), '1970-01-01 00:00:00+00'::timestamp with time zone), COALESCE(c.started_at, '1970-01-01 00:00:00+00'::timestamp with time zone)) AS last_activity_at,
            count(m.id) AS message_count,
            count(m.media_id) FILTER (WHERE m.media_id IS NOT NULL) AS media_count
           FROM conversations c
             LEFT JOIN messages m ON m.conversation_id = c.conversation_id
          GROUP BY c.conversation_id, c.customer_phone, c.last_message_at, c.started_at
        )
 SELECT x.conversation_id,
    x.customer_phone,
    x.last_activity_at,
    x.message_count,
    x.media_count
   FROM latest x
     CROSS JOIN archive_settings s
  WHERE s.id = 1 AND x.message_count > 0 AND x.last_activity_at < (now() - make_interval(days => s.inactive_days)) AND NOT (EXISTS ( SELECT 1
           FROM orders o
          WHERE o.customer_phone = x.customer_phone AND (lower(TRIM(BOTH FROM COALESCE(o.woocommerce_status, ''::text))) = ANY (ARRAY['pending'::text, 'pending payment'::text, 'processing'::text, 'on-hold'::text, 'on hold'::text, 'checkout-draft'::text])))) AND NOT (EXISTS ( SELECT 1
           FROM whatsapp_outbox ob
          WHERE ob.phone = x.customer_phone AND (lower(TRIM(BOTH FROM COALESCE(ob.status, ''::text))) = ANY (ARRAY['pending'::text, 'queued'::text, 'processing'::text, 'sending'::text, 'retry'::text, 'waiting'::text, 'in_progress'::text])))) AND NOT (EXISTS ( SELECT 1
           FROM conversation_archives a
          WHERE a.conversation_id = x.conversation_id AND a.last_activity_at = x.last_activity_at AND (a.status = ANY (ARRAY['pending'::text, 'uploaded'::text, 'verified'::text, 'purging'::text, 'completed'::text]))));;
