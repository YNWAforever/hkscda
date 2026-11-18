import { describe, expect, test } from "bun:test";

import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  SECURITY_HEADERS,
  stampHtmlNonces,
  TRUSTED_TYPES_REPORT_ONLY,
  withNonceStampedMarkup,
} from "./security-headers";

const directive = (policy: string, name: string) =>
  policy.split("; ").find((value) => value.startsWith(name + " "))!;

describe("nonce-based script-src", () => {
  test("the baseline policy no longer trusts inline script", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"]!;
    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'nonce-");
    expect(scriptSrc).toBe(
      "script-src 'self' https://www.googletagmanager.com https://maps.googleapis.com https://challenges.cloudflare.com",
    );
  });

  test("a request nonce is the only inline-script authority, with strict-dynamic", () => {
    const csp = buildContentSecurityPolicy(undefined, "dGhpcy1pcy1hLW5vbmNl");
    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).toBe(
      "script-src 'self' 'nonce-dGhpcy1pcy1hLW5vbmNl' 'strict-dynamic' https://www.googletagmanager.com https://maps.googleapis.com https://challenges.cloudflare.com",
    );
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    // Dynamically inserted loader scripts (GA4, Maps, Turnstile) stay trusted through
    // strict-dynamic, and the host list remains for browsers without it.
    expect(scriptSrc).toContain("'strict-dynamic'");
    expect(scriptSrc).toContain("https://www.googletagmanager.com");
    expect(scriptSrc).toContain("https://maps.googleapis.com");
    expect(scriptSrc).toContain("https://challenges.cloudflare.com");
  });

  test("keeps the violation reporting directives", () => {
    const csp = buildContentSecurityPolicy(undefined, "bm9uY2U");
    expect(csp).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(csp).toContain(`report-to ${CSP_REPORT_GROUP}`);
  });

  test("ignores a non-base64 nonce instead of interpolating it", () => {
    const csp = buildContentSecurityPolicy(undefined, "x; script-src *");
    const scriptSrc = directive(csp, "script-src");
    expect(scriptSrc).not.toContain("nonce-");
    expect(scriptSrc).not.toContain("script-src *");
    expect(csp.match(/script-src /g)).toHaveLength(1);
  });

  test("applySecurityHeaders stamps the request's nonce on that response only", () => {
    const first = applySecurityHeaders(new Response("ok"), "Zmlyc3Qtbm9uY2U=");
    const second = applySecurityHeaders(new Response("ok"), "c2Vjb25kLW5vbmNl");
    expect(directive(first.headers.get("Content-Security-Policy")!, "script-src")).toContain(
      "'nonce-Zmlyc3Qtbm9uY2U='",
    );
    expect(directive(second.headers.get("Content-Security-Policy")!, "script-src")).toContain(
      "'nonce-c2Vjb25kLW5vbmNl'",
    );
    // The shared constant is not mutated by a request.
    expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toContain("nonce-");
  });

  test("the static Trusted Types Report-Only header still ships on nonced responses", () => {
    const response = applySecurityHeaders(new Response("ok"), "bm9uY2U");
    expect(response.headers.get("Content-Security-Policy-Report-Only")).toBe(
      TRUSTED_TYPES_REPORT_ONLY,
    );
  });

  test("still does not overwrite a CSP the handler set itself", () => {
    const original = new Response(null, {
      headers: { "Content-Security-Policy": "default-src 'none'" },
    });
    const result = applySecurityHeaders(original, "bm9uY2U");
    expect(result.headers.get("Content-Security-Policy")).toBe("default-src 'none'");
  });

  test("stampHtmlNonces adds the nonce to script and style tags that lack one", () => {
    const html =
      '<script type="module" src="/app.js"></script><style>body{color:red}</style><script nonce="already">ok</script><style nonce="already">p{}</style>';
    expect(stampHtmlNonces(html, "Zmlyc3Qtbm9uY2U=")).toBe(
      '<script nonce="Zmlyc3Qtbm9uY2U=" type="module" src="/app.js"></script><style nonce="Zmlyc3Qtbm9uY2U=">body{color:red}</style><script nonce="already">ok</script><style nonce="already">p{}</style>',
    );
  });

  test("stampHtmlNonces ignores a nonce that is not safe to interpolate", () => {
    const html = "<script>window.x=1</script><style>body{}</style>";
    expect(stampHtmlNonces(html, 'x"><script>')).toBe(html);
  });

  test("withNonceStampedMarkup stamps HTML and leaves JSON unread as-is", async () => {
    const html = await withNonceStampedMarkup(
      new Response("<script>window.x=1</script><style>body{}</style>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      "Zmlyc3Qtbm9uY2U=",
    );
    expect(await html.text()).toBe(
      '<script nonce="Zmlyc3Qtbm9uY2U=">window.x=1</script><style nonce="Zmlyc3Qtbm9uY2U=">body{}</style>',
    );
    const json = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
    const untouched = await withNonceStampedMarkup(json, "Zmlyc3Qtbm9uY2U=");
    expect(untouched).toBe(json);
    expect(await untouched.json()).toEqual({ ok: true });
  });
});

describe("nonce-based style-src", () => {
  test("inline <style> elements require the request nonce", () => {
    const baseline = directive(SECURITY_HEADERS["Content-Security-Policy"]!, "style-src");
    expect(baseline).toBe("style-src 'self'");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).not.toContain(
      "style-src 'self' 'unsafe-inline'",
    );

    const csp = buildContentSecurityPolicy(undefined, "bm9uY2U");
    expect(directive(csp, "style-src-elem")).toBe("style-src-elem 'self' 'nonce-bm9uY2U'");
    expect(directive(csp, "style-src")).toBe("style-src 'self'");
    // The only surviving 'unsafe-inline' in the whole policy is the attribute directive.
    expect(csp.match(/'unsafe-inline'/g)).toHaveLength(1);
    expect(directive(csp, "style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
  });

  test("style attributes keep their explicit, documented allowance", () => {
    // React style attributes (data-driven colours, offsets) and third-party widgets
    // (Google Maps) set style="..." and no nonce can cover an attribute, so the
    // attribute directive is the one place 'unsafe-inline' remains. A block here is
    // reported as effectiveDirective: style-src-attr.
    for (const policy of [
      SECURITY_HEADERS["Content-Security-Policy"]!,
      buildContentSecurityPolicy(undefined, "bm9uY2U"),
    ]) {
      expect(directive(policy, "style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
      expect(directive(policy, "style-src")).not.toContain("'unsafe-inline'");
      expect(directive(policy, "style-src-elem") ?? "").not.toContain("'unsafe-inline'");
    }
  });

  test("the chart's runtime style element reads the nonce back from the document", () => {
    // ChartStyle is rendered on the server (request nonce in scope) and again during
    // client-side navigation (currentCspNonce() is undefined then), so it falls back to
    // the meta[property=csp-nonce] the root route publishes.
    expect(directive(buildContentSecurityPolicy(), "style-src-elem")).toBe("style-src-elem 'self'");
  });
});
