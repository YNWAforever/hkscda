# Governance/Team CMS Records (BP-3) Design

**Status:** Approved, ready for planning.

## Problem

`/about/team` currently shows a static "尚未發佈" (not yet published) state for its board section. The code comment explains why (defect G-09): the board list used to name two real individuals and their offices directly in hardcoded page source. Those are real people and an accountability claim, and nothing in the repository established who approved the list or when it was last correct — so it was pulled rather than continue publishing an unverifiable claim.

BP-3 replaces that gap with a real, minimal CMS: an admin-managed board roster with an audit trail, published through the same RLS-and-layered-API architecture already used throughout this codebase.

## Scope

**In scope:**
- A new `board_member` table and its RLS policies.
- A layered admin API (`repository.server.ts` → `service.ts` → `http.server.ts` → route handlers) for CRUD on board members, gated to the `admin` role only.
- A new admin UI page for managing the roster.
- A real loader and three distinct states (populated / genuinely empty / load failure) on `/about/team`'s board section.

**Out of scope (explicitly deferred):**
- The page's existing "義工團隊" (volunteer team) section — static prose, unrelated to this defect, left untouched.
- Any multi-person approval workflow (draft → separate approver → publish). Decided: single-step publish + `audit_log` row per mutation, matching this codebase's existing "admin mutations write an audit_log row" convention — not the heavier draft/submit/publish state machine used by the adoption-guide release flow.
- Photos, bios, or term-end dates. Decided: name + role/title only, matching what the page's existing copy already promises ("管治名單會連同生效日期一併公開").
- Any change to `contentManagement` access — this introduces a new, separate `governanceManagement` access area rather than reusing the existing one that `staff` already has, because board membership is a higher-stakes accountability claim about real people than a story or knowledge post.

## Data model

New table `board_member`:

| Column | Type | Notes |
|---|---|---|
| `id` | uuid, PK | |
| `name` | text, not null | |
| `role_title` | text, not null | Office — chair, treasurer, etc. |
| `sort_order` | integer, not null | Display order |
| `effective_date` | date, not null | When this membership/role took effect |
| `is_active` | boolean, not null, default true | Soft-delete — a departed member's row is deactivated, not erased, preserving governance history |
| `created_by` / `updated_by` | uuid | Admin identity performing the mutation |
| `created_at` / `updated_at` | timestamptz, not null, default now() | |

**RLS**: anon can `select` rows where `is_active = true`, limited to the public-safe columns (`name`, `role_title`, `sort_order`, `effective_date`) — a board roster is meant to be public, unlike the adopter/case data BP-1 dealt with, so no service-role aggregate is needed for reads. All writes go through the admin API layer (`requireAdmin`), never a direct anon/authenticated client write from the browser.

**Audit**: every insert/update/soft-delete writes its own `audit_log` row at the app layer, matching the pairing rule `adminRouteAuditing.test.ts` already enforces for other domains.

## Admin API and UI

**New access area**: `governanceManagement` added to `AdminAccessArea` (`src/lib/admin/access.ts`), granted only to the `admin` role in `ROLE_ACCESS` — not `staff`, not `treasurer`.

**Layered API**, following this codebase's established pattern:
- `src/lib/governance/types.ts`, `schemas.ts` (zod validation for `name`/`role_title`/`sort_order`/`effective_date`), `repository.server.ts` (Supabase CRUD against `board_member`), `service.ts` (business rules, pure, no Supabase import), `http.server.ts` (parse → status codes → error mapping).
- `src/routes/api/governance/board-members/route.ts` + `-handlers.ts`: `GET` (admin list, including inactive), `POST` (create), `PATCH` (update), `DELETE` (soft-delete, sets `is_active = false`) — each calling `requireAdmin(request, ["admin"], client)` before delegating.

**Admin UI**: `src/components/admin/content/GovernanceManagement.tsx` — a plain CRUD table (name, role/title, sort order, active/inactive, effective date), no multi-step wizard, wired into `src/routes/admin/content/governance.tsx` and registered in `adminNav.ts`/`pageAccess.ts` under the new `governanceManagement` area.

## Public page

`src/routes/about/team.tsx` gains a real loader (currently fully static), reading active board members via the anon client, wrapped in `resilientPublicLoader` for graceful degradation — matching every other real-data public route in this codebase.

Three distinct states, each honest about what's actually true:
1. **Populated** — board member list (name + role/title) ordered by `sort_order`, plus a "資料最後更新" line from the real `MAX(updated_at)` across active rows. Replaces the current `PublicStateShell` "董事會名單暫未發佈" block.
2. **Genuinely empty** (zero active rows — e.g. between board terms) — a distinct "尚未有公開資料" state, not an error.
3. **Load failure** — a distinct "暫時未能載入" state, matching the same principle established in BP-1's `/report/adoption` fix: a runtime fetch failure is a different situation from "genuinely not yet published" or "genuinely empty," and must not be conflated with either.

## Testing

- Repository/service/http-layer tests with injected fakes, matching this codebase's established per-layer testing convention.
- A route test for `/about/team` mirroring `/report/adoption`'s pattern: populated/empty/error states each render distinctly.
- `adminRouteAuditing.test.ts` coverage for the new domain's mutation-audit pairing.

## Success criteria

- `/about/team`'s board section shows a real, admin-managed roster instead of the static "not published" state, or an honest empty/error state when appropriate.
- Only the `admin` role can create, edit, or deactivate board members.
- Every board-roster mutation writes an `audit_log` row, giving the page's "effective date" promise a real, verifiable backing.
- No adopter/case-style privacy concern applies here (board rosters are meant to be public), so no service-role aggregate is needed for reads — RLS alone gates writes appropriately.
