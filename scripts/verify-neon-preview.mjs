// This is a SELECT-only connectivity check for the isolated Vercel Neon Preview.
// It is intentionally skipped in production and in local/CI builds.
const isTargetPreview =
  process.env.VERCEL_ENV === "preview" &&
  process.env.VERCEL_GIT_COMMIT_REF === "feature/neon-snapshot-fallback-20261009";

if (!isTargetPreview) {
  console.log("[Neon Preview] Not target preview build: connectivity check skipped");
} else {
  if (process.env.CRM_READ_SOURCE !== "neon_shadow" || !process.env.DATABASE_URL) {
    console.error("[Neon Preview] Required preview-only configuration is missing");
    process.exitCode = 1;
  } else {
    try {
      const { neon } = await import("@neondatabase/serverless");
      const sql = neon(process.env.DATABASE_URL);
      const [row] = await sql`
        SELECT
          (SELECT count(*)::int FROM public.messages) AS messages,
          (SELECT count(*)::int FROM public.orders) AS orders,
          (SELECT count(*)::int FROM public.conversations) AS conversations,
          (SELECT count(*)::int FROM public.migration_source_rows WHERE sheet_name = 'MESSAGES') AS staged_messages,
          (SELECT count(*)::int FROM public.migration_source_rows WHERE sheet_name = 'ORDERS') AS staged_orders
      `;
      const counts = Object.fromEntries(
        Object.entries(row || {}).map(([key, value]) => [key, Number(value)])
      );
      if (!counts.messages || !counts.orders || !counts.conversations ||
          counts.messages !== counts.staged_messages ||
          counts.orders !== counts.staged_orders) {
        throw new Error("Incomplete or inconsistent preview snapshot");
      }
      const [access] = await sql`
        SELECT
          current_user::text AS role_name,
          pg_has_role(current_user, 'neon_superuser', 'member') AS is_admin,
          has_table_privilege(current_user, 'public.orders', 'INSERT') AS orders_insert,
          has_table_privilege(current_user, 'public.orders', 'UPDATE') AS orders_update,
          has_table_privilege(current_user, 'public.orders', 'DELETE') AS orders_delete,
          has_table_privilege(current_user, 'public.messages', 'INSERT') AS messages_insert,
          has_table_privilege(current_user, 'public.messages', 'UPDATE') AS messages_update,
          has_table_privilege(current_user, 'public.messages', 'DELETE') AS messages_delete
      `;
      if (access?.role_name !== "sanureva_reader_limited" || access.is_admin ||
          access.orders_insert || access.orders_update || access.orders_delete ||
          access.messages_insert || access.messages_update || access.messages_delete) {
        throw new Error("DATABASE_URL is not configured with verified read-only privileges");
      }
      console.log("[Neon Preview] Confirmed read-only database role and no order/message writes");
      console.log("[Neon Preview] Connectivity and internal row-count parity passed", counts);
      console.log("[Neon Preview] Preview data freshness must be compared against Sheets separately");
    } catch (error) {
      console.error("[Neon Preview] Failed to read Neon preview database:", error?.message || "Unknown error");
      process.exitCode = 1;
    }
  }
}
