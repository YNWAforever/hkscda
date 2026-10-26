import { afterEach, describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { gtagEvent, initGA4, redactSensitivePagePath } from "./analytics";
import { trackHelpEvent } from "./help/analytics";
import { reportLovableError } from "./lovable-error-reporting";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");

afterEach(() => {
  for (const [name, descriptor] of [
    ["window", originalWindow],
    ["document", originalDocument],
  ] as const) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else Reflect.deleteProperty(globalThis, name);
  }
});

function browser(pathname: string, referrer = "") {
  const events: unknown[][] = [];
  const errors: unknown[][] = [];
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      location: { origin: "https://site.invalid", pathname },
      gtag: (...args: unknown[]) => events.push(args),
      __lovableEvents: { captureException: (...args: unknown[]) => errors.push(args) },
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { referrer, title: "Status", getElementById: () => ({}) },
  });
  return { events, errors };
}

describe("private status tokens at telemetry boundaries", () => {
  // Characterize the router assumption that originally defeated the redaction matcher.
  test("redacts a mixed-case URL accepted by the actual router", async () => {
    const root = createRootRoute();
    const status = createRoute({ getParentRoute: () => root, path: "/adoption/status/$token" });
    const router = createRouter({
      routeTree: root.addChildren([status]),
      history: createMemoryHistory({ initialEntries: ["/Adoption/Status/PrivateBearer"] }),
    });
    await router.load();
    expect(router.state.matches.at(-1)?.routeId).toBe("/adoption/status/$token");
    expect(router.state.matches.at(-1)?.params).toEqual({ token: "PrivateBearer" });
    expect(redactSensitivePagePath(router.state.location.pathname)).toBe(
      "/adoption/status/[token]",
    );
  });

  test.each([
    ["/adoption/status/PrivateBearer", "/adoption/status/[token]"],
    ["/SPONSORS/STATUS/PrivateBearer/", "/sponsors/status/[token]"],
    ["/Volunteer/Status/PrivateBearer", "/volunteer/status/[token]"],
  ])("Help events redact %s", (path, template) => {
    const { events } = browser(path);
    trackHelpEvent("help_widget_open", { language: "en" });
    expect(events[0]).toEqual([
      "event",
      "help_widget_open",
      expect.objectContaining({ page_path: template, language: "en" }),
    ]);
    expect(JSON.stringify(events)).not.toContain("PrivateBearer");
  });

  test("redacts an explicitly supplied Help page path", () => {
    const { events } = browser("/help");
    trackHelpEvent("help_cta_click", { pagePath: "/adoption/status/PrivateBearer" });
    expect(events[0]).toEqual([
      "event",
      "help_cta_click",
      expect.objectContaining({ page_path: "/adoption/status/[token]" }),
    ]);
    expect(JSON.stringify(events)).not.toContain("PrivateBearer");
  });

  test("GA configuration protects the current URL even without a caller override", () => {
    const { events } = browser("/Adoption/Status/PrivateBearer");
    initGA4("G-TEST");
    expect(events.at(-1)).toEqual([
      "config",
      "G-TEST",
      expect.objectContaining({
        page_location: "https://site.invalid/adoption/status/[token]",
        page_path: "/adoption/status/[token]",
      }),
    ]);
  });

  test("custom GA events override sensitive default page and referrer fields", () => {
    const { events } = browser(
      "/volunteer/status/PrivateBearer",
      "https://site.invalid/SPONSORS/STATUS/ReferrerBearer?secret=QueryBearer#HashBearer",
    );
    gtagEvent("help_widget_open", { language: "en" });
    expect(events[0]).toEqual([
      "event",
      "help_widget_open",
      {
        language: "en",
        page_location: "https://site.invalid/volunteer/status/[token]",
        page_path: "/volunteer/status/[token]",
        page_referrer: "https://site.invalid/sponsors/status/[token]",
      },
    ]);
    expect(JSON.stringify(events)).not.toContain("Bearer");
  });

  test("GA configuration redacts a sensitive referrer on an ordinary destination", () => {
    const { events } = browser("/help", "https://site.invalid/adoption/status/ReferrerBearer");
    initGA4("G-TEST");
    expect(events.at(-1)).toEqual([
      "config",
      "G-TEST",
      { page_referrer: "https://site.invalid/adoption/status/[token]" },
    ]);
  });

  test("ordinary analytics attributes survive a malformed referrer", () => {
    const { events } = browser("/help", "not a URL");
    gtagEvent("help_result_click", { page_path: "/help", faq_id: "adoption" });
    expect(events[0]).toEqual([
      "event",
      "help_result_click",
      { page_path: "/help", faq_id: "adoption" },
    ]);
  });

  test("error-report route context cannot disclose a status bearer", () => {
    const { errors } = browser("/Sponsors/Status/PrivateBearer");
    const error = new Error("Synthetic rendering failure");
    reportLovableError(error, { boundary: "test", route: "/Sponsors/Status/PrivateBearer" });
    expect(errors[0]).toEqual([
      error,
      {
        source: "react_error_boundary",
        boundary: "test",
        route: "/sponsors/status/[token]",
      },
      { mechanism: "react_error_boundary", handled: false, severity: "error" },
    ]);
    expect(JSON.stringify(errors[0][1])).not.toContain("PrivateBearer");
  });

  test("telemetry is safe without browser globals", () => {
    Reflect.deleteProperty(globalThis, "window");
    Reflect.deleteProperty(globalThis, "document");
    expect(() => initGA4("G-TEST")).not.toThrow();
    expect(() => gtagEvent("help_widget_open")).not.toThrow();
    expect(() => reportLovableError(new Error("Synthetic failure"))).not.toThrow();
  });
});
