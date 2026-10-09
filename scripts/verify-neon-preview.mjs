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
      console.log("[Neon Preview] Database connection and read-only checks passed", counts);
      console.log("[Neon Preview] Snapshot is isolated and is NOT continuously synchronized");
    } catch (error) {
      console.error("[Neon Preview] Failed to read Neon preview database:", error?.message || "Unknown error");
      process.exitCode = 1;
    }
  }
}
