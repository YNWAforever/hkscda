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
// Violations are still reported: report-uri and report-to are kept, so an
// enforced block is visible rather than silent.
//
// 'unsafe-inline' remains for now (TanStack Start injects inline hydration
// script/style); moving to nonces is the next hardening step.
/** Where the browser POSTs CSP violation reports. See routes/api/csp-report.ts. */
export const CSP_REPORT_PATH = "/api/csp-report";
/** Reporting API group name, declared by the `Reporting-Endpoints` header. */
export const CSP_REPORT_GROUP = "csp";

export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://maps.googleapis.com https://challenges.cloudflare.com",
  // Turnstile renders in an iframe. Without this the widget cannot mount and
  // every Turnstile-gated form fails closed.
  "frame-src 'self' https://challenges.cloudflare.com",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.google-analytics.com https://*.google-analytics.com https://maps.googleapis.com https://maps.gstatic.com https://challenges.cloudflare.com",
  "form-action 'self'",
  // Both spellings on purpose: `report-uri` is deprecated but is what Safari and
  // older Chrome still honour; `report-to` is the Reporting API successor and
  // needs the `Reporting-Endpoints` header below to resolve the group name.
  `report-uri ${CSP_REPORT_PATH}`,
  `report-to ${CSP_REPORT_GROUP}`,
].join("; ");

export const SECURITY_HEADERS: Record<string, string> = {
  "Reporting-Endpoints": `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Content-Security-Policy": CONTENT_SECURITY_POLICY,
};

// Add the security headers to a response without clobbering any the handler
// already set. Mutates in place when possible (preserves SSR streaming bodies);
// falls back to a rebuilt response if the header set is immutable.
export function applySecurityHeaders(response: Response): Response {
  try {
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!response.headers.has(key)) response.headers.set(key, value);
    }
    return response;
  } catch {
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
      if (!headers.has(key)) headers.set(key, value);
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}
