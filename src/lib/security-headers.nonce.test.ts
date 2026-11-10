import { describe, expect, test } from "bun:test";

import {
  applySecurityHeaders,
  buildContentSecurityPolicy,
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  SECURITY_HEADERS,
  stampHtmlScriptNonces,
  withNonceStampedScripts,
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

  test("keeps style-src unsafe-inline for React style attributes and the error page", () => {
    for (const policy of [
      SECURITY_HEADERS["Content-Security-Policy"]!,
      buildContentSecurityPolicy(undefined, "bm9uY2U"),
    ]) {
      expect(directive(policy, "style-src")).toBe("style-src 'self' 'unsafe-inline'");
    }
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

  test("still does not overwrite a CSP the handler set itself", () => {
    const original = new Response(null, {
      headers: { "Content-Security-Policy": "default-src 'none'" },
    });
    const result = applySecurityHeaders(original, "bm9uY2U");
    expect(result.headers.get("Content-Security-Policy")).toBe("default-src 'none'");
  });

  test("stampHtmlScriptNonces adds the nonce to script tags that lack one", () => {
    const html =
      '<script type="module" src="/app.js"></script><script>window.x=1</script><script nonce="already">ok</script>';
    expect(stampHtmlScriptNonces(html, "Zmlyc3Qtbm9uY2U=")).toBe(
      '<script nonce="Zmlyc3Qtbm9uY2U=" type="module" src="/app.js"></script><script nonce="Zmlyc3Qtbm9uY2U=">window.x=1</script><script nonce="already">ok</script>',
    );
  });

  test("stampHtmlScriptNonces ignores a nonce that is not safe to interpolate", () => {
    const html = "<script>window.x=1</script>";
    expect(stampHtmlScriptNonces(html, 'x"><script>')).toBe(html);
  });

  test("withNonceStampedScripts stamps HTML and leaves JSON unread as-is", async () => {
    const html = await withNonceStampedScripts(
      new Response("<script>window.x=1</script>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
      "Zmlyc3Qtbm9uY2U=",
    );
    expect(await html.text()).toBe('<script nonce="Zmlyc3Qtbm9uY2U=">window.x=1</script>');
    const json = new Response(JSON.stringify({ ok: true }), {
      headers: { "content-type": "application/json" },
    });
    const untouched = await withNonceStampedScripts(json, "Zmlyc3Qtbm9uY2U=");
    expect(untouched).toBe(json);
    expect(await untouched.json()).toEqual({ ok: true });
  });
});
