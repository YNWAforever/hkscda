import { expect, test } from "bun:test";
import type { Metric } from "web-vitals";
import { publicMetricRoute, startPublicMetrics } from "./publicMetrics";

test("templates capability and detail paths and excludes unknown/private routes", () => {
  expect(publicMetricRoute("/adoption/status/secret?email=private#name")).toBe(
    "/adoption/status/[token]",
  );
  expect(publicMetricRoute("/animals/cat/cat-secret")).toBe("/animals/cat/[id]");
  expect(publicMetricRoute("/stories/private-title")).toBe("/stories/[slug]");
  expect(publicMetricRoute("/donate?email=private")).toBe("/donate");
  for (const path of [
    "/admin",
    "/api/donations",
    "/unknown-person",
    "https://remote.test/donate",
    "//remote.test/donate",
  ])
    expect(publicMetricRoute(path)).toBeNull();
});

test("does not load observers without explicit activation and current consent", async () => {
  let loads = 0;
  const common = {
    getConsent: () => false,
    getPathname: () => "/donate",
    device: "mobile" as const,
    send: () => {},
    load: async () => {
      loads++;
      return {} as never;
    },
  };
  await startPublicMetrics(common);
  await startPublicMetrics({ ...common, enabled: true });
  expect(loads).toBe(0);
});

test("emits only numeric metrics and templates; revocation/navigation/stop suppress callbacks", async () => {
  let consent = true;
  let path = "/adoption/status/private-token";
  const callbacks: Array<(metric: Pick<Metric, "name" | "id" | "value" | "delta">) => void> = [];
  const sent: unknown[] = [];
  const register = (
    callback: (metric: Pick<Metric, "name" | "id" | "value" | "delta">) => void,
  ) => {
    callbacks.push(callback);
  };
  const stop = await startPublicMetrics({
    enabled: true,
    getConsent: () => consent,
    getPathname: () => path,
    device: "mobile",
    send: (value: unknown) => sent.push(value),
    load: async () => ({ onCLS: register, onLCP: register, onINP: register }),
  });
  expect(callbacks).toHaveLength(3);
  const metric = {
    name: "LCP" as const,
    value: 2400,
    delta: 2400,
    id: "private-token",
    entries: [{ url: "secret" }],
    attribution: { target: "private-name" },
  };
  callbacks[1](metric);
  expect(sent).toHaveLength(1);
  const payload = sent[0] as Record<string, unknown>;
  expect(payload.route).toBe("/adoption/status/[token]");
  expect(payload.device).toBe("mobile");
  expect(payload.value).toBe(2400);
  expect(JSON.stringify(payload)).not.toContain("private");
  expect(Object.keys(payload).sort()).toEqual(
    ["delta", "device", "metricId", "name", "route", "scope", "value"].sort(),
  );
  consent = false;
  callbacks[1](metric);
  expect(sent).toHaveLength(1);
  consent = true;
  path = "/donate";
  callbacks[1](metric);
  expect(sent).toHaveLength(1);
  path = "/adoption/status/private-token";
  stop();
  callbacks[1](metric);
  expect(sent).toHaveLength(1);
});

test("consent revoked while importing prevents observer registration", async () => {
  let consent = true;
  let registrations = 0;
  const register = () => {
    registrations++;
  };
  await startPublicMetrics({
    enabled: true,
    getConsent: () => consent,
    getPathname: () => "/",
    device: "desktop",
    send: () => {},
    load: async () => {
      consent = false;
      return { onCLS: register, onLCP: register, onINP: register };
    },
  });
  expect(registrations).toBe(0);
});

test("route inventory matches real listing and privacy routes", () => {
  for (const path of [
    "/animals/cat",
    "/animals/dog",
    "/about/privacy",
    "/adoption/instructions",
    "/volunteer/group",
    "/knowledge",
  ])
    expect(publicMetricRoute(path)).toBe(path);
  for (const path of [
    "/animals/cats",
    "/animals/dogs",
    "/privacy",
    "/terms",
    "/contact",
    "/adoption",
  ])
    expect(publicMetricRoute(path)).toBeNull();
});

// A browser without usable secure-context randomness must not break a form callback.
test("opaque ID generation failure cannot escape the metrics callback", async () => {
  const callbacks: Array<(metric: Pick<Metric, "name" | "id" | "value" | "delta">) => void> = [];
  const register = (
    callback: (metric: Pick<Metric, "name" | "id" | "value" | "delta">) => void,
  ) => {
    callbacks.push(callback);
  };
  const original = crypto.randomUUID;
  const stop = await startPublicMetrics({
    enabled: true,
    getConsent: () => true,
    getPathname: () => "/",
    device: "desktop",
    send: () => {
      throw new Error("must not reach send");
    },
    load: async () => ({ onCLS: register, onINP: register, onLCP: register }),
  });
  try {
    crypto.randomUUID = () => {
      throw new Error("unavailable");
    };
    expect(() => callbacks[0]({ name: "CLS", value: 0, delta: 0, id: "fixture" })).not.toThrow();
  } finally {
    crypto.randomUUID = original;
    stop();
  }
});
