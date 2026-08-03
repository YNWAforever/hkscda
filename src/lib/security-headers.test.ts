import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import {
  applySecurityHeaders,
  CSP_REPORT_GROUP,
  CSP_REPORT_PATH,
  SECURITY_HEADERS,
} from "./security-headers";

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
    expect(result.headers.get("Content-Security-Policy-Report-Only")).toContain(
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://maps.googleapis.com",
    );
    expect(result.headers.get("Content-Security-Policy-Report-Only")).toContain(
      "connect-src 'self' https://*.supabase.co https://api.stripe.com https://www.google-analytics.com https://*.google-analytics.com https://maps.googleapis.com https://maps.gstatic.com",
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

  test("routes violations to a collector so Report-Only produces data", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy-Report-Only"]!;

    // Without a reporting destination, Report-Only only writes to the console of
    // whoever happens to have devtools open — there is nothing to tune the
    // allow-list against before switching CSP to enforcing.
    expect(csp).toContain(`report-uri ${CSP_REPORT_PATH}`);
    expect(csp).toContain(`report-to ${CSP_REPORT_GROUP}`);
  });

  test("declares the report-to group via Reporting-Endpoints", () => {
    const result = applySecurityHeaders(new Response("ok"));

    expect(result.headers.get("Reporting-Endpoints")).toBe(
      `${CSP_REPORT_GROUP}="${CSP_REPORT_PATH}"`,
    );
  });

  test("CSP_REPORT_PATH matches the actual collector route's URL", () => {
    // TanStack Router requires createFileRoute's argument to be a static
    // literal, so CSP_REPORT_PATH can't be imported into that call — these
    // are necessarily two separate literals. This test is what keeps them
    // in sync: change one without the other and this fails, instead of CSP
    // reports silently 404ing against a URL with no route behind it.
    const routeSource = readFileSync(
      join(process.cwd(), "src", "routes", "api", "csp-report.ts"),
      "utf8",
    );
    const match = routeSource.match(/createFileRoute\("([^"]+)"\)/);
    expect(match?.[1]).toBe(CSP_REPORT_PATH);
  });
});
