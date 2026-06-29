import process from "node:process";

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export type VerifyTurnstileDeps = {
  fetch?: typeof fetch;
  secret?: string;
};

/**
 * Whether the process is running as a production deployment. On Vercel,
 * `VERCEL_ENV` distinguishes production from preview/development (NODE_ENV is
 * "production" for previews too, so it is not precise enough on its own).
 */
export function isProductionRuntime(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.VERCEL_ENV) return env.VERCEL_ENV === "production";
  return env.NODE_ENV === "production";
}

/**
 * Fail loudly at startup when the client and server Turnstile config disagree.
 *
 * The client renders the widget (and gates the submit button) on
 * `VITE_TURNSTILE_SITE_KEY`; the server enforces on `TURNSTILE_SECRET_KEY`.
 * If exactly one is set the form silently breaks:
 * - secret only  → no widget renders, the form POSTs a null token, the server
 *   rejects every submission with 403 (a full donation/adoption outage);
 * - site key only → the widget produces a token but the server fails open and
 *   ignores it (the CAPTCHA is silently disabled).
 *
 * Requiring both-or-neither in production turns either inconsistency into an
 * obvious boot failure instead of a silent production incident.
 */
export function assertTurnstileConfig(config: {
  siteKey?: string | null;
  secret?: string | null;
  isProduction: boolean;
}): void {
  if (!config.isProduction) return;
  const hasSiteKey = Boolean(config.siteKey);
  const hasSecret = Boolean(config.secret);
  if (hasSiteKey === hasSecret) return;
  throw new Error(
    "Turnstile misconfiguration: set BOTH VITE_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY, " +
      `or neither. Got site key ${hasSiteKey ? "set" : "MISSING"}, secret ` +
      `${hasSecret ? "set" : "MISSING"}. An inconsistent pair either rejects every submission ` +
      "(secret only) or silently disables the CAPTCHA (site key only).",
  );
}

/** Run {@link assertTurnstileConfig} against the live environment at startup. */
export function assertTurnstileConfigFromEnv(env: NodeJS.ProcessEnv = process.env): void {
  assertTurnstileConfig({
    siteKey: env.VITE_TURNSTILE_SITE_KEY,
    secret: env.TURNSTILE_SECRET_KEY,
    isProduction: isProductionRuntime(env),
  });
}

let warnedTurnstileDisabled = false;
function warnTurnstileDisabledOnce(): void {
  if (warnedTurnstileDisabled) return;
  warnedTurnstileDisabled = true;
  if (isProductionRuntime()) {
    console.error(
      "TURNSTILE_SECRET_KEY is not set in production: Turnstile verification is DISABLED " +
        "(failing open). This should only happen when Turnstile is intentionally turned off.",
    );
  }
}

/**
 * Verify a Cloudflare Turnstile token server-side.
 *
 * Hybrid failure policy:
 * - Fails OPEN (returns true) when `TURNSTILE_SECRET_KEY` is unset, so dev,
 *   preview, and the existing test suite work without a key configured. In
 *   production this path is guarded by {@link assertTurnstileConfigFromEnv}
 *   (which boots-fails on a site-key-only config) and logged once via
 *   `warnTurnstileDisabledOnce`, so it can never be a *silent* bypass.
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
  if (!secret) {
    warnTurnstileDisabledOnce();
    return true;
  }
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
