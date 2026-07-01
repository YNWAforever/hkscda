# Admin Access Management Design

## Summary

Add role-based admin access management to the existing HKSCDA admin panel. The first version will use the current broad roles only: `staff`, `treasurer`, and `admin`. It will not introduce custom per-page or per-user permissions.

The feature adds an admin-only Access Management screen where active `admin` users can invite new admin users, resend invites, change roles, disable/reactivate users, and review recent access-management audit history.

## Goals

- Let `admin` users manage admin access from the admin panel.
- Preserve the current role meanings:
  - `staff`: animals and adoption/coordinator workflows.
  - `treasurer`: donations, payments, supporters, and receipts.
  - `admin`: all admin functions, including access management and coordinator status settings.
- Support Supabase Auth email invites from a server-only API.
- Keep the UI bilingual through the existing admin language switcher.
- Prevent lockouts by blocking self-disable/self-demotion and blocking removal of the last active `admin`.
- Add route and sidebar gating so users only see admin sections available to their role.

## Non-Goals

- No custom permission matrix in v1.
- No per-user permission overrides in v1.
- No public-site role management.
- No migration away from Supabase Auth.
- No broad redesign of existing admin screens.

## Current Context

The project already has a `public.admin_user` table with:

- `auth_user_id`
- `email`
- `role`
- `status`
- timestamps

Server routes already use `requireAdmin(request, allowedRoles)` with these role groupings:

- Adoption/coordinator APIs: `staff`, `admin`
- Coordinator status admin APIs: `admin`
- Donations/supporters/receipts APIs: `treasurer`, `admin`
- Payment read APIs: `staff`, `treasurer`, `admin`

Admin page loaders currently mostly check for a signed-in Supabase session, so v1 should add a shared role-aware page guard and nav filtering while keeping API enforcement as the hard security boundary.

## Recommended Approach

Use the existing `admin_user` table as the role source of truth and add an admin-only API layer for all access-management mutations. Supabase Auth admin invite calls must stay server-side using the service-role client. The browser should never call Supabase admin auth methods directly.

This approach fits the current codebase, keeps the schema small, keeps guardrails centralized, and avoids overbuilding a full RBAC system before the project needs one.

## Data Model

Extend `public.admin_user`:

- Change `status` from `active | disabled` to `pending | active | disabled`.
- Keep `auth_user_id` required. For new invites, store the Supabase Auth user id returned by the server-side invite call.
- Allow pending invite rows before the user has accepted the invite, while still tying each row to its Supabase Auth user.
- Add invite metadata:
  - `invited_at timestamptz`
  - `invite_sent_at timestamptz`
  - `invite_accepted_at timestamptz`
  - `last_invited_by uuid`

Keep `role` constrained to:

- `staff`
- `treasurer`
- `admin`

Existing active and disabled rows remain valid.

### Invite State

When an admin invites a user:

1. The server validates that the caller is an active `admin`.
2. The server blocks duplicate pending or active admin records for the same email.
3. The server sends a Supabase Auth invite by email.
4. The server creates or updates an `admin_user` row:
   - `auth_user_id`: Supabase Auth user id from the invite response
   - `email`: invited email
   - `role`: selected role
   - `status`: `pending`
   - `invited_at`: current timestamp
   - `invite_sent_at`: current timestamp
   - `last_invited_by`: actor auth user id

When the invited user accepts and signs in, the first authenticated admin bootstrap/check endpoint should find the pending `admin_user` row by `auth_user_id`, promote it to `active`, and set `invite_accepted_at`.

## Roles And Access

Role access mapping:

| Area | staff | treasurer | admin |
| --- | --- | --- | --- |
| Animals | yes | no | yes |
| Adoption cases | yes | no | yes |
| Manual case intake | yes | no | yes |
| Coordinator task center | yes | no | yes |
| Adopters | yes | no | yes |
| Coordinator reports | yes | no | yes |
| Coordinator statuses | no | no | yes |
| Payments | read access where currently allowed; mutations no | yes | yes |
| Supporters/CRM | no | yes | yes |
| Receipts | no | yes | yes |
| Access Management | no | no | yes |

The route and nav guard should use the same mapping so visible sidebar items match page-level access.

## UI Design

Add a new admin sidebar item:

- 中文: `權限管理`
- English: `Access Management`

Only active `admin` users see it.

The page includes:

- Summary cards:
  - active admins
  - pending invites
  - disabled users
- Admin user table:
  - email
  - role
  - status
  - invited date
  - last updated
  - actions
- Invite dialog:
  - email
  - role
  - submit
- Row actions:
  - resend invite
  - change role
  - disable
  - reactivate
- Audit/history section:
  - recent access-management actions from `audit_log`

All UI copy, roles, statuses, validation messages, and errors must support the existing admin language switcher.

## Access Denied Behavior

When a signed-in user opens a page their role cannot access:

- Show a clear Access Denied page.
- Include a short reason.
- Include a link back to the first admin area available to that role.

The API must still return `403` for unauthorized calls. UI hiding and page guards are usability improvements, not security boundaries.

## API Design

Add admin-only access-management API routes:

- `GET /api/admin/access/users`
  - Returns admin users plus summary counts.
- `POST /api/admin/access/invites`
  - Body: `{ email, role }`
  - Sends Supabase invite and creates a pending admin row.
- `POST /api/admin/access/invites/:id/resend`
  - Resends invite for a pending admin row.
- `PATCH /api/admin/access/users/:id`
  - Supports role updates and status transitions.
- `GET /api/admin/access/audit`
  - Lists recent access-management audit log rows.

Every route requires `requireAdmin(request, ["admin"])`.

## Guardrails

The server must block:

- Self-disable.
- Self-demotion from `admin`.
- Disabling or demoting the last active `admin`.
- Creating a duplicate active or pending admin for the same email.
- Resending an invite for a non-pending user.
- Invalid role or status transitions.

The client should show friendly validation where possible, but the server owns these rules.

## Audit Logging

Write records to existing `audit_log` for:

- `admin_user.invite`
- `admin_user.invite_resend`
- `admin_user.role_update`
- `admin_user.disable`
- `admin_user.reactivate`
- `admin_user.activate_from_invite`

Each audit row should include:

- actor auth user id
- target admin user id
- target email
- old and new role/status where applicable
- timestamp

## Error Handling

Expected API errors:

- `401`: missing or invalid token
- `403`: caller is not an active `admin`
- `409`: duplicate active or pending admin invite
- `422`: invalid role, invalid status transition, self-demotion/self-disable, or last-active-admin removal
- `500`: unexpected server failure

The UI should translate expected error messages into Chinese or English using the current admin language. Unexpected errors can show a generic translated fallback while logging server details.

## Testing

Automated checks:

- Unit tests for role/page access mapping.
- Unit tests for first-allowed-admin-route selection.
- Unit tests for lockout guardrails.
- HTTP handler tests for `401`, `403`, `409`, and `422` paths.
- HTTP handler tests for invite, resend invite, role update, disable, and reactivate.
- Migration test that verifies `pending` status and invite metadata fields exist.

Manual checks:

1. Sign in as `admin`.
2. Invite a new user by email and role.
3. Confirm pending invite appears.
4. Resend invite.
5. Accept invite and sign in as invited user.
6. Confirm user becomes active and sees only role-allowed navigation.
7. Change role and confirm nav/page/API behavior follows the new role.
8. Disable and reactivate a user.
9. Confirm self-disable/self-demote and last-active-admin removal are blocked.
10. Confirm Access Denied appears for disallowed pages.
11. Confirm Chinese and English admin copy are complete.

## Implementation Notes

- Keep Supabase service-role usage server-only.
- Prefer a shared role-access utility used by admin nav, route guards, and tests.
- Add a shared admin identity endpoint or loader helper so admin pages can get the current active admin record consistently.
- Do not rely on `user_metadata` or client-provided claims for authorization.
- Keep the access-management feature separate from supporter roles; `supporter_role` is for CRM supporter classification, not admin authorization.
