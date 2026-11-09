// Baseline security response headers, applied to every SSR + API response in
// src/server.ts. Static assets are served by the Vercel CDN and bypass the
// server handler; they don't need CSP/frame headers.
//
// The CSP is enforcing (BP-5). It shipped Report-Only while the allow-list was
// tuned against the real app; the self-hosted fonts from WP-1 removed the last
// third-party style and font origin, so enforcement no longer risks the shell.
//
// Turning it on exposed something Report-Only had hidden: Turnstile was never in
// the policy. It loads a script from challenges.cloudflare.com and renders its
// widget in an iframe, and there was no frame-src directive at all, so enforcing
// the previous list would have broken the adoption, volunteer and sponsorship
// forms - every gated public form on the site.
//
// `script-src` uses a per-request nonce instead of `'unsafe-inline'` (2026-11-09
// audit, AUDIT R4). src/server.ts generates a fresh nonce for each request,
// src/router.tsx puts it on the router (`ssr.nonce`), and TanStack Start stamps it
// on every inline script it emits for the render: the hydration/bootstrap
// `<Scripts>` tags, `ScriptOnce`, and the JSON-LD blocks declared through route
// `head.scripts`. Scripts our own nonced code inserts at runtime (GA4's gtag
// loader, the Google Maps loader, Turnstile) are allowed by `'strict-dynamic'`;
// the host sources that follow it are only read by browsers that do not support
// `'strict-dynamic'` yet, which is why they stay.
//
// `style-src` keeps `'unsafe-inline'`: React style attributes (and the error page's
// inline `<style>`) are inline styles, and a style nonce covers only `<style>`
// elements, never `style="..."` attributes. Removing it would need every inline
// style migrated to classes first; forcing that split is a separate change.
//
// Violations are still reported: report-uri and report-to are kept, so an
// enforced block is visible rather than silent.
/** Where the browser POSTs CSP violation reports. See routes/api/csp-report.ts. */
export const CSP_REPORT_PATH = "/api/csp-report";
/** Reporting API group name, declared by the `Reporting-Endpoints` header. */
export const CSP_REPORT_GROUP = "csp";

/** The external script origins the app loads (directly or through a trusted loader). */
const SCRIPT_HOST_SOURCES = [
  "https://www.googletagmanager.com",
  "https://maps.googleapis.com",
  "https://challenges.cloudflare.com",
] as const;

/** Accept only a single configured service origin; never interpolate raw env into CSP. */
export function configuredSupabaseOrigin(value?: string): string | null {
  if (!value || /[\s;"'\\*]/.test(value)) return null;
  try {
    const url = new URL(value);
    if (url.username || url.password) return null;
    const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) return null;
    return url.origin;
  } catch {
    return null;
  }
}

/**
 * The policy for one response. `nonce` is the request's CSP nonce; when it is omitted (tests, or
 * a response rendered outside the SSR request context) the policy has no nonce and no
 * `'strict-dynamic'`, so no inline script is trusted — the only such response is the static error
 * page, which carries no script at all. A nonce that is not base64 is ignored rather than
 * interpolated, so a caller can never inject a directive through it.
 */
export function buildContentSecurityPolicy(supabaseUrl?: string, nonce?: string): string {
  const origin = configuredSupabaseOrigin(supabaseUrl);
  const configuredSource = origin ? ` ${origin}` : "";
  const safeNonce = nonce && /^[A-Za-z0-9+/]+={0,2}$/.test(nonce) ? nonce : undefined;
  const scriptSources = ["'self'"];
  if (safeNonce) scriptSources.push(`'nonce-${safeNonce}'`, "'strict-dynamic'");
  scriptSources.push(...SCRIPT_HOST_SOURCES);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `img-src 'self' data: https:${configuredSource}`,
    "font-src 'self' data:",
    // React style attributes (`style={{...}}`) and the error page's inline <style> need this; a
    // style nonce cannot cover style attributes, so it is kept deliberately (see the file header).
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSources.join(" ")}`,
    // Turnstile renders in an iframe. Without this the widget cannot mount and
    // every Turnstile-gated form fails closed.
    "frame-src 'self' https://challenges.cloudflare.com",
    `connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.google-analytics.com https://*.google-analytics.com https://maps.googleapis.com https://maps.gstatic.com https://challenges.cloudflare.com${configuredSource}`,
    "form-action 'self'",
    // Both spellings on purpose: `report-uri` is deprecated but is what Safari and
    // older Chrome still honour; `report-to` is the Reporting API successor and
    // needs the `Reporting-Endpoints` header below to resolve the group name.
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join("; ");
}

// Use the same build-time public URL as the browser Supabase client, never a
// request header or the server-only internal database endpoint.
export const CONTENT_SECURITY_POLICY = buildContentSecurityPolicy(
  import.meta.env.VITE_SUPABASE_URL,
);

export const SECURITY_HEADERS: Record<string, string> = {
  "Reporting-Endpoints": `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
};

/**
 * Add the security headers to a response without clobbering any the handler
 * already set. Mutates in place when possible (preserves SSR streaming bodies);
 * falls back to a rebuilt response if the header set is immutable.
 *
 * Pass the request's CSP nonce so this response's `script-src` matches the nonce
 * on the inline scripts in its markup; the baseline headers are used when it is
 * omitted.
 */
export function applySecurityHeaders(response: Response, nonce?: string): Response {
  const headers: Record<string, string> = nonce
    ? {
        ...SECURITY_HEADERS,
        "Content-Security-Policy": buildContentSecurityPolicy(
          import.meta.env.VITE_SUPABASE_URL,
          nonce,
        ),
      }
    : SECURITY_HEADERS;
  try {
    for (const [key, value] of Object.entries(headers)) {
      if (!response.headers.has(key)) response.headers.set(key, value);
    }
    return response;
  } catch {
    const rebuiltHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(headers)) {
      if (!rebuiltHeaders.has(key)) rebuiltHeaders.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: rebuiltHeaders,
    });
  }
}
