/**
 * Supabase email links (invite, recovery) land on the project's Site URL when the
 * link's `redirectTo` is not in the Auth redirect allow-list. That URL is set in the
 * Supabase dashboard and cannot be changed from the repository, so the app must
 * recognise the auth payload wherever it lands and forward it to the admin
 * set-password screen.
 *
 * Supabase's implicit flow appends the session to the URL fragment:
 *   /#access_token=...&refresh_token=...&type=invite
 * and error responses to the fragment as well:
 *   /#error=access_denied&error_code=otp_expired&error_description=...
 *
 * The reset-password screen already understands both the SIGNED_IN/PASSWORD_RECOVERY
 * events and the "no session" invalid state; this helper only decides where to send
 * the browser. BUG-25.
 */

export type AuthLandingLocation = {
  pathname: string;
  search: string;
  hash: string;
};

const RESET_PATH = "/admin/reset-password";

function paramsFrom(hash: string): URLSearchParams {
  return new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash);
}

/**
 * Returns the path (including the original fragment) the browser should load for an
 * auth email landing, or null when the current URL is not such a landing.
 *
 * A landing is recognised only when the fragment carries a typed `invite`/`recovery`
 * payload or Supabase's own `error_code`/`error_description`. A bare `#error=...`
 * anchor is left alone. Payload types that belong to other flows (signup, magiclink)
 * are not redirected.
 */
export function resolveAuthLandingTarget(location: AuthLandingLocation): string | null {
  if (!location.hash) return null;
  if (location.pathname === RESET_PATH || location.pathname.startsWith(`${RESET_PATH}/`)) {
    return null;
  }

  const params = paramsFrom(location.hash);
  const type = params.get("type");
  const typedInviteOrRecovery = type === "invite" || type === "recovery";
  const typeIsOtherFlow = type !== null && !typedInviteOrRecovery;
  const supabaseError = Boolean(params.get("error_code") || params.get("error_description"));

  if (typeIsOtherFlow) return null;
  if (!typedInviteOrRecovery && !supabaseError) return null;

  const intent = type === "invite" ? "invite" : null;
  const search = intent ? `?intent=${intent}` : "";
  // Keep the fragment: the Supabase browser client reads the tokens from it when the
  // reset page boots, and an error fragment lets the page show the invalid state.
  return `${RESET_PATH}${search}${location.hash}`;
}
