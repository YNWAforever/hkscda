// Baseline security response headers, applied to every SSR + API response in
// src/server.ts. Static assets are served by the Vercel CDN and bypass the
// server handler; they don't need CSP/frame headers.
//
// CSP ships Report-Only first: it reports violations to the browser console
// without blocking, so the allow-list can be tuned against the real app before
// switching to an enforcing Content-Security-Policy. 'unsafe-inline' is allowed
// for now (TanStack Start injects inline hydration script/style); migrating to
// nonces is the eventual hardening step.
/** Where the browser POSTs CSP violation reports. See routes/api/csp-report.ts. */
export const CSP_REPORT_PATH = "/api/csp-report";
/** Reporting API group name, declared by the `Reporting-Endpoints` header. */
export const CSP_REPORT_GROUP = "csp";

export const CONTENT_SECURITY_POLICY_REPORT_ONLY = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "img-src 'self' data: https:",
  "font-src 'self' data:",
  "style-src 'self' 'unsafe-inline'",
  "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://maps.googleapis.com",
  "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.google-analytics.com https://*.google-analytics.com https://maps.googleapis.com https://maps.gstatic.com",
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
  "Content-Security-Policy-Report-Only": CONTENT_SECURITY_POLICY_REPORT_ONLY,
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
