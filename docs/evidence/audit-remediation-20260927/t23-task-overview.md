# T23 task overview slice

Status: read-only overview under review, stacked after #157. This is one T23 slice; ADMIN-04 remains partial because the cross-domain bulk workflows are not implemented here.

The page is available to active staff, treasurer and admin roles through the normal page guard and a fresh server-side requireAdmin check. Each role sees 3-5 relevant queues. The server runs bounded count + oldest queries, and Promise.allSettled keeps one failing source from hiding the others. A failed or absent count is explicitly unavailable, not zero. The same six-group admin navigation remains; the overview is a separate leading link that remains visible in the collapsed/mobile sidebar. Counts read task state only; no notification, refund, approval or content publication happens from this page.

Local evidence: role/output/outage/direct API and static UI tests passed; all 11 query shapes returned nonnegative counts through the dedicated loopback Supabase PostgREST (no fixture mutation). Typecheck, lint and build exit 0. Full isolated suite passed 2849 with 90 skipped and 0 failed after a parallel-build timing failure in the migration-safety scan; that targeted scan passed 1/1 when rerun alone. Same-SHA remote CI and role browser UAT remain open.

Known limits: Cards currently open the correct existing workspace but do not preserve an exact queue filter in its URL. The overview omits schema/worker readiness until a safe read model exists; that field must stay unknown rather than be shown as healthy. Staff bulk work still needs snapshot, preview, per-item role/version check, apply, durable result and retry. Separate domain PRs are required; this slice does not authorize a generic write endpoint. Real role browser UAT is not-run without test identities.
