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
    // Enforcing, not report-only (BP-5).
    const csp = result.headers.get("Content-Security-Policy");
    expect(csp).toBeTruthy();
    expect(result.headers.get("Content-Security-Policy-Report-Only")).toBeNull();
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("https://www.googletagmanager.com");
    expect(csp).toContain("https://maps.googleapis.com");
    // Still reported, so an enforced block is visible rather than silent.
    expect(csp).toContain("report-uri");
    expect(csp).toContain("report-to");
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

  test("ships CSP enforcing", () => {
    // Report-Only was the tuning phase. It ended when WP-1 self-hosted the fonts
    // and removed the last third-party style and font origin.
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toBeDefined();
    expect(SECURITY_HEADERS["Content-Security-Policy-Report-Only"]).toBeUndefined();
  });

  test("routes violations to a collector so an enforced block is visible", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"]!;

    // Enforcing without reporting means a blocked resource fails silently for the
    // visitor and leaves no trace for anyone else.
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

describe("the policy covers what the app actually loads", () => {
  const csp = SECURITY_HEADERS["Content-Security-Policy"];

  test("allows the Turnstile script and its iframe", () => {
    // Report-Only hid this: Turnstile was never in the policy, and there was no
    // frame-src at all. Enforcing without these breaks every gated public form.
    const widget = readFileSync(
      join(process.cwd(), "src/components/site/TurnstileWidget.tsx"),
      "utf8",
    );
    expect(widget).toContain("https://challenges.cloudflare.com");

    expect(csp).toContain("frame-src");
    const frameSrc = csp.split("; ").find((d) => d.startsWith("frame-src"));
    expect(frameSrc).toContain("https://challenges.cloudflare.com");
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toContain("https://challenges.cloudflare.com");
  });

  test("allows the Google Maps loader", () => {
    const loader = readFileSync(
      join(process.cwd(), "src/components/site/stories/googleMapsLoader.ts"),
      "utf8",
    );
    expect(loader).toContain("https://maps.googleapis.com");
    const scriptSrc = csp.split("; ").find((d) => d.startsWith("script-src"));
    expect(scriptSrc).toContain("https://maps.googleapis.com");
  });

  test("no longer allows third-party fonts or styles", () => {
    // WP-1 self-hosted Noto Sans HK; nothing should reach Google Fonts.
    expect(csp).not.toContain("fonts.googleapis.com");
    expect(csp).not.toContain("fonts.gstatic.com");
    const fontSrc = csp.split("; ").find((d) => d.startsWith("font-src"));
    expect(fontSrc).toBe("font-src 'self' data:");
  });
});
