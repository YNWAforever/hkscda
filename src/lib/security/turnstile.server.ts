const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type VerifyTurnstileDeps = {
  fetch?: typeof fetch;
  secret?: string;
};

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * Hybrid failure policy:
 * - Fails OPEN (returns true) when `TURNSTILE_SECRET_KEY` is unset, so dev,
 *   preview, and the existing test suite work without a key configured.
 * - Fails CLOSED (returns false) once a secret IS configured but the token is
 *   missing/invalid or the verification request fails. Treat "secret set in
 *   production" as the enforced state.
 */
export async function verifyTurnstile(
  token: string | undefined | null,
  ip?: string,
  deps: VerifyTurnstileDeps = {},
): Promise<boolean> {
  const secret = deps.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "unknown") body.set("remoteip", ip);

  try {
    const doFetch = deps.fetch ?? globalThis.fetch;
    const response = await doFetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    if (!response.ok) return false;
    const result = (await response.json()) as { success?: boolean };
    return result.success === true;
  } catch (error) {
    console.error("Turnstile verification failed", error);
    return false;
  }
}
