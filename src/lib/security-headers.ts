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
// `style-src` now uses the same per-request nonce for `<style>` elements (2026-11-11
// follow-up): src/server.ts stamps the nonce onto style tags in the SSR markup, and
// components that create a style element at runtime (the chart CSS-variable block)
// read the nonce back from the `meta[property=csp-nonce]` the root route publishes.
// The static error page carries no inline style at all - its CSS is linked from
// /error.css. `style-src-attr` keeps `'unsafe-inline'` because React style
// attributes (`style={{...}}`, widely used for data-driven colours/offsets) and
// third-party widgets (Google Maps injects style attributes) cannot carry a nonce;
// that attribute allowance is the documented residual, and a blocked attribute is
// reported as `effectiveDirective: style-src-attr` through the same collector.
//
// Violations are still reported: report-uri and report-to are kept, so an
// enforced block is visible rather than silent.
//
// A second policy ships separately in `Content-Security-Policy-Report-Only`
// (2026-11-10): Trusted Types for script, the next layer after script-src. It is
// report-only by design - it measures DOM-XSS sinks without blocking anything -
// and reuses the same collector. `trusted-types 'none'` is the strictest baseline:
// it reports every place that would need a Trusted Types policy before enforcement
// is considered. Chromium-only; other browsers ignore the header.
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
  const styleSources = ["'self'"];
  if (safeNonce) styleSources.push(`'nonce-${safeNonce}'`);
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    `img-src 'self' data: https:${configuredSource}`,
    "font-src 'self' data:",
    // `style-src` is the legacy fallback (no inline element is allowed); modern browsers
    // use the two specific directives below. `style-src-attr` must stay inline because
    // React and third-party widgets set style attributes (see the file header).
    "style-src 'self'",
    `style-src-elem ${styleSources.join(" ")}`,
    "style-src-attr 'unsafe-inline'",
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

/**
 * Trusted Types in Report-Only: the next CSP layer after the nonce migration.
 * `require-trusted-types-for 'script'` reports DOM-XSS sinks (innerHTML,
 * script.src, eval, ...) that receive a plain string; `trusted-types 'none'`
 * additionally reports any attempt to create a policy, so the report stream shows
 * the full surface that would need a policy before enforcing. The policy is static
 * (no nonce), so it never varies per response.
 */
export function buildTrustedTypesReportOnlyPolicy(): string {
  return [
    "require-trusted-types-for 'script'",
    "trusted-types 'none'",
    `report-uri ${CSP_REPORT_PATH}`,
    `report-to ${CSP_REPORT_GROUP}`,
  ].join("; ");
}

export const TRUSTED_TYPES_REPORT_ONLY = buildTrustedTypesReportOnlyPolicy();

export const SECURITY_HEADERS: Record<string, string> = {
  "Reporting-Endpoints": `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
  "Content-Security-Policy-Report-Only": TRUSTED_TYPES_REPORT_ONLY,
};

const SAFE_NONCE = /^[A-Za-z0-9+/]+={0,2}$/;

/**
 * Put the request nonce on every `<script>` and `<style>` tag that does not already
 * have one. TanStack/Nitro may emit hydration scripts before this request's nonce
 * exists (a reused router, or HTML rendered at build time), and the chart's
 * CSS-variable block is a style element. The CSP header always carries a fresh
 * nonce, so those tags must be stamped here or the browser blocks them. The nonce
 * charset cannot break out of the double-quoted attribute.
 */
export function stampHtmlNonces(html: string, nonce: string): string {
  if (!SAFE_NONCE.test(nonce)) return html;
  return html
    .replace(/<script\b(?![^>]*\bnonce\s*=)/gi, `<script nonce="${nonce}"`)
    .replace(/<style\b(?![^>]*\bnonce\s*=)/gi, `<style nonce="${nonce}"`);
}

/**
 * For HTML responses, stamp the request nonce onto script and style tags, then
 * return a new body. Non-HTML responses (JSON APIs) are left unread and unchanged.
 */
export async function withNonceStampedMarkup(
  response: Response,
  nonce?: string,
): Promise<Response> {
  if (!nonce || !SAFE_NONCE.test(nonce)) return response;
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.toLowerCase().includes("text/html")) return response;
  const html = await response.text();
  const stamped = stampHtmlNonces(html, nonce);
  if (stamped === html) {
    return new Response(html, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(stamped, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
