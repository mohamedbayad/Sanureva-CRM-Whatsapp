-- QA BRANCH ONLY. This script deliberately leaves the role NOLOGIN.
-- Guard requires the synthetic archive QA fixture; fail closed on Main.
DO $qa$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.conversations
    WHERE conversation_id = 'TEST-ARCH-LEASE-NEW'
      AND customer_phone = 'QA-LEASE-NONPHONE-20261010'
  ) THEN
    RAISE EXCEPTION 'Refusing QA role setup: isolated synthetic fixture missing';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname = 'sanureva_archive_qa'
  ) THEN
    CREATE ROLE sanureva_archive_qa
      NOLOGIN NOINHERIT NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.member
    JOIN pg_roles parent ON parent.oid=m.roleid
    WHERE r.rolname='sanureva_archive_qa' AND parent.rolname='neon_superuser'
  ) THEN
    RAISE EXCEPTION 'QA role unexpectedly inherits neon_superuser';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_roles
    WHERE rolname='sanureva_archive_qa'
      AND (rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls)
  ) THEN
    RAISE EXCEPTION 'QA role unexpectedly elevated';
  END IF;
END $qa$;

GRANT CONNECT ON DATABASE sanureva TO sanureva_archive_qa;
GRANT USAGE ON SCHEMA public TO sanureva_archive_qa;

GRANT SELECT ON
  public.archive_settings, public.archive_candidates_preview,
  public.conversations, public.messages, public.orders,
  public.whatsapp_outbox, public.conversation_archives,
  public.archived_message_keys
TO sanureva_archive_qa;

GRANT INSERT, UPDATE ON public.conversation_archives TO sanureva_archive_qa;
GRANT INSERT ON public.archived_message_keys TO sanureva_archive_qa;

GRANT EXECUTE ON FUNCTION
  public.claim_sanureva_backup(integer),
  public.sanureva_archive_resumable(uuid),
  public.finalize_sanureva_leased_backup(uuid,uuid,text,bigint,integer)
TO sanureva_archive_qa;

-- The role intentionally cannot log in until a dedicated QA-only
-- credential is created in Neon and attached to a cloned n8n QA workflow.
-- Never reuse the Main Neon role/password in an n8n QA credential.
