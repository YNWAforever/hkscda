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
export type PasswordRecoveryResult =
  | { ok: true }
  | { ok: false; reason: PasswordRecoveryFailure };

export function normalizeAdminEmail(email: string) {
  return email.trim().toLowerCase();
}

export function getAdminPasswordResetRedirect(origin: string) {
  return `${origin.replace(/\/$/, "")}/admin/reset-password`;
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
