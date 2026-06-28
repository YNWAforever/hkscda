import { describe, expect, test } from "bun:test";

import { applySecurityHeaders, SECURITY_HEADERS } from "./security-headers";

describe("applySecurityHeaders", () => {
  test("sets the baseline security headers on a response", () => {
    const result = applySecurityHeaders(new Response("ok", { status: 200 }));

    expect(result.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(result.headers.get("X-Frame-Options")).toBe("DENY");
    expect(result.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(result.headers.get("Strict-Transport-Security")).toContain("max-age=");
    expect(result.headers.get("Permissions-Policy")).toContain("geolocation=()");
    expect(result.headers.get("Content-Security-Policy-Report-Only")).toContain(
      "frame-ancestors 'none'",
    );
  });

  test("preserves status, body, and existing headers", async () => {
    const original = new Response("hello", {
      status: 201,
      headers: { "content-type": "text/plain", "x-custom": "keep" },
    });
    const result = applySecurityHeaders(original);

    expect(result.status).toBe(201);
    expect(await result.text()).toBe("hello");
    expect(result.headers.get("content-type")).toBe("text/plain");
    expect(result.headers.get("x-custom")).toBe("keep");
  });

  test("does not overwrite a header the handler already set", () => {
    const original = new Response(null, {
      status: 200,
      headers: { "X-Frame-Options": "SAMEORIGIN" },
    });
    const result = applySecurityHeaders(original);

    expect(result.headers.get("X-Frame-Options")).toBe("SAMEORIGIN");
  });

  test("ships CSP as Report-Only so it cannot break the app", () => {
    expect(SECURITY_HEADERS["Content-Security-Policy-Report-Only"]).toBeDefined();
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBeUndefined();
  });
});
