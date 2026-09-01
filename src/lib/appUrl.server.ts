/**
 * The server-side base URL for links built into emails, receipts, and
 * redirect/callback URLs (donation return URLs, receipt PDF asset URLs,
 * status-page links). Distinct from PUBLIC_SITE_ORIGIN in publicOrigin.ts,
 * which is for client-rendered HTML (canonicals, Open Graph tags) and reads
 * a different, client-visible env var (VITE_PUBLIC_SITE_ORIGIN).
 *
 * Defect G-20 (server-side half): this fallback used to be duplicated
 * across eight call sites, with donations/config.server.ts's copy carrying
 * a stale :3000 default while every other copy already used Vite's actual
 * dev server port, :5173. Unified here so there is exactly one fallback to
 * keep correct.
 */
export function getAppUrl(): string {
  return process.env.APP_URL ?? "http://localhost:5173";
}
