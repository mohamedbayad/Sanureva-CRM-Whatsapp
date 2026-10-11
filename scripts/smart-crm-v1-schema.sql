-- Sanureva Smart CRM v1: additive migration ONLY. Run in Neon QA before production.
-- Absolutely no DELETE, TRUNCATE, order update, media changes or automated WhatsApp sends.
-- All automation rules are DISABLED by default.
CREATE TABLE IF NOT EXISTS public.crm_contact_journeys (
  phone text PRIMARY KEY CHECK (phone ~ '^[0-9]{8,20}$'),
  customer_name text NOT NULL DEFAULT '',
  stage text NOT NULL DEFAULT 'new_lead' CHECK (stage IN (
    'new_lead','engaged','awaiting_details','order_placed','confirmed',
    'tracking_sent','in_delivery','delivered','cancelled')),
  stage_source text NOT NULL DEFAULT 'manual' CHECK (stage_source IN (
    'manual','bot','woocommerce','whatsapp_callback','carrier','import')),
  linked_order_id text,
  tracking_number text,
  tracking_url text,
  last_inbound_at timestamptz,
  last_outbound_at timestamptz,
  last_outbound_read_at timestamptz,
  last_stage_at timestamptz NOT NULL DEFAULT now(),
  do_not_contact boolean NOT NULL DEFAULT false,
  audio_consent boolean NOT NULL DEFAULT false,
  marketing_opt_in boolean NOT NULL DEFAULT false,
  automation_paused boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_journey_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  event_key text NOT NULL UNIQUE CHECK (length(event_key) BETWEEN 8 AND 255),
  phone text NOT NULL REFERENCES public.crm_contact_journeys(phone),
  event_type text NOT NULL CHECK (event_type IN (
    'stage_change','message_sent','message_read','customer_replied','tracking_sent',
    'delivery_update','order_created','order_confirmed','followup_skipped','audio_consent','opt_out')),
  stage_from text,
  stage_to text,
  order_id text,
  whatsapp_wamid text,
  event_source text NOT NULL,
  happened_at timestamptz NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_message_templates (
  template_key text PRIMARY KEY CHECK (template_key ~ '^[a-z0-9_]{3,64}$'),
  display_name text NOT NULL,
  language_code text NOT NULL DEFAULT 'es_GT',
  stage text NOT NULL,
  media_kind text NOT NULL DEFAULT 'text' CHECK (media_kind IN ('text','audio')),
  message_body text NOT NULL DEFAULT '',
  audio_media_id text,
  wa_approved_template_name text,
  wa_approval_status text NOT NULL DEFAULT 'draft' CHECK (wa_approval_status IN ('draft','pending','approved','rejected')),
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (media_kind <> 'audio' OR audio_media_id IS NOT NULL OR message_body <> '')
);

CREATE TABLE IF NOT EXISTS public.crm_followup_rules (
  rule_key text PRIMARY KEY CHECK (rule_key ~ '^[a-z0-9_]{3,64}$'),
  display_name text NOT NULL,
  trigger_kind text NOT NULL CHECK (trigger_kind IN (
    'read_no_reply','inactivity','tracking_sent','delivery_status_update','order_awaiting_confirmation')),
  target_stage text NOT NULL,
  template_key text NOT NULL REFERENCES public.crm_message_templates(template_key),
  wait_hours integer NOT NULL DEFAULT 24 CHECK (wait_hours BETWEEN 1 AND 720),
  cooldown_hours integer NOT NULL DEFAULT 48 CHECK (cooldown_hours BETWEEN 1 AND 720),
  max_attempts_per_stage integer NOT NULL DEFAULT 1 CHECK (max_attempts_per_stage BETWEEN 1 AND 3),
  requires_marketing_opt_in boolean NOT NULL DEFAULT true,
  require_24h_service_window boolean NOT NULL DEFAULT true,
  enabled boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_followup_jobs (
  job_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 8 AND 255),
  phone text NOT NULL REFERENCES public.crm_contact_journeys(phone),
  rule_key text NOT NULL REFERENCES public.crm_followup_rules(rule_key),
  template_key text NOT NULL REFERENCES public.crm_message_templates(template_key),
  target_stage text NOT NULL,
  due_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','needs_review','blocked','ready','queued','sent','failed','cancelled')),
  attempt_count integer NOT NULL DEFAULT 0,
  outbox_request_id text,
  wa_message_id text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.crm_ad_touchpoints (
  touch_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  phone text NOT NULL CHECK (phone ~ '^[0-9]{8,20}$'),
  source text NOT NULL CHECK (source IN ('ctwa_referral','website','manual_import')),
  first_message_wamid text,
  ctwa_clid text,
  campaign_id text,
  adset_id text,
  ad_id text,
  landing_url text,
  fbclid text,
  gclid text,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  occurred_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source, first_message_wamid)
);

CREATE TABLE IF NOT EXISTS public.crm_meta_ads_insights_daily (
  insight_date date NOT NULL,
  ad_account_id text NOT NULL,
  campaign_id text NOT NULL,
  adset_id text NOT NULL DEFAULT '',
  ad_id text NOT NULL,
  campaign_name text,
  adset_name text,
  ad_name text,
  currency text NOT NULL,
  impressions bigint NOT NULL DEFAULT 0 CHECK (impressions >= 0),
  clicks bigint NOT NULL DEFAULT 0 CHECK (clicks >= 0),
  link_clicks bigint NOT NULL DEFAULT 0 CHECK (link_clicks >= 0),
  messaging_conversations_started bigint CHECK (messaging_conversations_started >= 0),
  spend numeric(16,4) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (insight_date,ad_account_id,ad_id)
);

CREATE INDEX IF NOT EXISTS crm_journey_events_phone_time_idx ON public.crm_journey_events(phone,happened_at DESC);
CREATE INDEX IF NOT EXISTS crm_followup_jobs_due_idx ON public.crm_followup_jobs(status,due_at);
CREATE INDEX IF NOT EXISTS crm_followup_jobs_phone_idx ON public.crm_followup_jobs(phone,created_at DESC);
CREATE INDEX IF NOT EXISTS crm_ad_touchpoints_ad_idx ON public.crm_ad_touchpoints(ad_id,occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_ad_touchpoints_phone_idx ON public.crm_ad_touchpoints(phone,occurred_at DESC);
CREATE INDEX IF NOT EXISTS crm_meta_insights_campaign_idx ON public.crm_meta_ads_insights_daily(campaign_id,insight_date);

-- The CRM service reader gets SELECT only. No write credentials are added to Vercel.
-- Future n8n worker needs a separate least-privilege role; do not grant it DELETE anywhere.
-- Tracking_sent is a CRM state after a confirmed outbound tracking message callback;
-- delivered means carrier-confirmed, not merely a WhatsApp delivered/read callback.
-- WhatsApp outside the 24h service window requires an approved message template:
-- do not automatically send arbitrary text or audio, and honor opt-outs and per-stage idempotency.
