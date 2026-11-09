export const ADMIN_PASSWORD_MIN_LENGTH = 8;

type AuthError = Error | { message: string } | null;

export interface PasswordRecoveryAuth {
  resetPasswordForEmail(
    email: string,
    options: { redirectTo: string },
  ): Promise<{ error: AuthError }>;
  updateUser(input: { password: string }): Promise<{ error: AuthError }>;
  signOut(): Promise<{ error: AuthError }>;
}

export type PasswordRecoveryFailure = "too_short" | "mismatch" | "provider_error";
export type PasswordRecoveryResult = { ok: true } | { ok: false; reason: PasswordRecoveryFailure };

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getAdminPasswordResetRedirect(origin: string) {
  return `${origin.replace(/\/$/, "")}/admin/reset-password`;
}

/** The query value the invite link appends so the set-password page shows invite wording. */
export const ADMIN_SET_PASSWORD_INTENT = "invite";

/**
 * Where an admin invite/resend link lands (BUG-25): the admin set-password page, marked as an
 * invite so the page says "set your password" rather than "reset your password".
 */
export function getAdminInviteRedirect(origin: string) {
  return `${getAdminPasswordResetRedirect(origin)}?intent=${ADMIN_SET_PASSWORD_INTENT}`;
}

export type AdminSetPasswordIntent = "invite" | "recovery";

export function parseAdminSetPasswordIntent(value: unknown): AdminSetPasswordIntent {
  return value === ADMIN_SET_PASSWORD_INTENT ? "invite" : "recovery";
}

export function validateAdminPassword(password: string, confirmation: string) {
  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) return "too_short" as const;
  if (password !== confirmation) return "mismatch" as const;
  return null;
}

export async function requestAdminPasswordReset(args: {
  auth: PasswordRecoveryAuth;
  email: string;
  origin: string;
}): Promise<PasswordRecoveryResult> {
  const { error } = await args.auth.resetPasswordForEmail(normalizeAdminEmail(args.email), {
    redirectTo: getAdminPasswordResetRedirect(args.origin),
  });
  return error ? { ok: false, reason: "provider_error" } : { ok: true };
}

export async function completeAdminPasswordReset(args: {
  auth: PasswordRecoveryAuth;
  password: string;
  confirmation: string;
}): Promise<PasswordRecoveryResult> {
  const validation = validateAdminPassword(args.password, args.confirmation);
  if (validation) return { ok: false, reason: validation };

  const { error } = await args.auth.updateUser({ password: args.password });
  if (error) return { ok: false, reason: "provider_error" };

  await args.auth.signOut();
  return { ok: true };
}
