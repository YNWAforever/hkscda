# Admin invite / recovery links — redirect allow-list and app-side fallback (2026-11-10)

## Why this exists

BUG-25's fix sends Supabase invite links to `<origin>/admin/reset-password?intent=invite` via
`generateLink({ type: "invite", options: { redirectTo } })` and the resend path. Supabase Auth only
honours `redirectTo` when the URL is covered by the project's **Auth **redirect allow-list\*\*
(Dashboard → Authentication → URL Configuration → Redirect URLs). That setting is stored by the
Supabase platform, not in the application database or repository, so it cannot be changed from
this codebase.

If the allow-list does not include the set-password URL, Supabase redirects the invitee to the
project's **Site URL** instead, dropping the invitee on `/` with the session in the URL fragment.

## What the app now does (fallback)

`src/lib/admin/authLanding.ts` recognises a Supabase invite/recovery payload on any page load in
`src/routes/__root.tsx` and forwards the browser to the admin set-password screen, keeping the
fragment so the Supabase browser client can consume it:

- `#access_token=…&refresh_token=…&type=invite` → `/admin/reset-password?intent=invite#…`
- `#access_token=…&type=recovery` → `/admin/reset-password#…`
- Supabase error payloads (`error_code` / `error_description`, e.g. an expired invite) → the reset
  screen, which shows the invalid-link state.
- Unrelated fragments/anchors and other auth flows (signup, magiclink) are not redirected.

This makes the invite and recovery emails work even when the dashboard allow-list is stale. The
page already understands `SIGNED_IN` (invite) and `PASSWORD_RECOVERY` events and the "no session"
invalid state.

## Applied on 2026-11-10 (via the Supabase Management API)

The project's Auth URL configuration had `site_url = https://hkscda.vercel.app/` and an **empty**
`uri_allow_list`, so every invite/recovery `redirectTo` fell back to the Site URL. The allow-list is
now:

```
https://hkscda.vercel.app/admin/reset-password
https://hkscda.vercel.app/admin/reset-password*
https://hkscda.com/admin/reset-password
https://hkscda.com/admin/reset-password*
https://www.hkscda.com/admin/reset-password
https://www.hkscda.com/admin/reset-password*
```

The `*` variants cover the `?intent=invite` query string; the `hkscda.com` entries are ready for the
DNS cutover. `site_url` stays `https://hkscda.vercel.app/` until cutover (it is the fallback
destination, and any path under it now lands correctly thanks to the app-side handler).

Changing this setting is not part of the repository: use the Supabase dashboard (Authentication →
URL Configuration) or the Management API
`PATCH /v1/projects/iihqjzilgawhfdhdevam/config/auth` with `{"uri_allow_list": "…"}`. Preview
deployments have their own origins; add them to the allow-list only if invites need to work from a
preview.

## Verification

- `src/lib/admin/authLanding.test.ts` covers invite, recovery, typed error, untyped Supabase error,
  unrelated anchors, other flow types and the no-op on the reset screen.
- Manual: open `/#access_token=…&refresh_token=…&type=invite` on a preview and confirm the browser
  lands on `/admin/reset-password?intent=invite` with the set-password form.
- Once the allow-list contains the URL, Supabase lands directly on the reset route and the fallback
  never fires (both paths are safe).
