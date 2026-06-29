import { describe, expect, test } from "bun:test";

import { assertTurnstileConfig, isProductionRuntime, verifyTurnstile } from "./turnstile.server";

function stubFetch(
  response: { ok?: boolean; body: unknown },
  capture?: (req: Request | string, init?: RequestInit) => void,
) {
  return (async (input: Request | string, init?: RequestInit) => {
    capture?.(input, init);
    return {
      ok: response.ok ?? true,
      async json() {
        return response.body;
      },
    } as Response;
  }) as typeof fetch;
}

describe("verifyTurnstile", () => {
  test("fails open when no secret is configured", async () => {
    expect(await verifyTurnstile("anything", "203.0.113.7", { secret: undefined })).toBe(true);
  });

  test("fails closed when a secret is set but the token is missing", async () => {
    expect(await verifyTurnstile(undefined, "203.0.113.7", { secret: "sk" })).toBe(false);
    expect(await verifyTurnstile("", "203.0.113.7", { secret: "sk" })).toBe(false);
  });

  test("returns true when Cloudflare confirms success", async () => {
    const fetch = stubFetch({ body: { success: true } });
    expect(await verifyTurnstile("token", "203.0.113.7", { secret: "sk", fetch })).toBe(true);
  });

  test("returns false when Cloudflare reports failure", async () => {
    const fetch = stubFetch({
      body: { success: false, "error-codes": ["invalid-input-response"] },
    });
    expect(await verifyTurnstile("token", "203.0.113.7", { secret: "sk", fetch })).toBe(false);
  });

  test("returns false when the siteverify response is not ok", async () => {
    const fetch = stubFetch({ ok: false, body: {} });
    expect(await verifyTurnstile("token", undefined, { secret: "sk", fetch })).toBe(false);
  });

  test("fails closed when the verification request throws", async () => {
    const fetch = (async () => {
      throw new Error("network");
    }) as typeof fetch;
    expect(await verifyTurnstile("token", undefined, { secret: "sk", fetch })).toBe(false);
  });

  test("sends secret, token and remoteip in the request body", async () => {
    let captured: RequestInit | undefined;
    const fetch = stubFetch({ body: { success: true } }, (_req, init) => {
      captured = init;
    });
    await verifyTurnstile("the-token", "203.0.113.7", { secret: "sk", fetch });
    const params = captured?.body as URLSearchParams;
    expect(params.get("secret")).toBe("sk");
    expect(params.get("response")).toBe("the-token");
    expect(params.get("remoteip")).toBe("203.0.113.7");
  });

  test("omits remoteip when the IP is unknown", async () => {
    let captured: RequestInit | undefined;
    const fetch = stubFetch({ body: { success: true } }, (_req, init) => {
      captured = init;
    });
    await verifyTurnstile("the-token", "unknown", { secret: "sk", fetch });
    const params = captured?.body as URLSearchParams;
    expect(params.get("remoteip")).toBeNull();
  });
});

describe("isProductionRuntime", () => {
  test("uses VERCEL_ENV when present", () => {
    expect(isProductionRuntime({ VERCEL_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isProductionRuntime({ VERCEL_ENV: "preview" } as NodeJS.ProcessEnv)).toBe(false);
    expect(
      isProductionRuntime({ VERCEL_ENV: "preview", NODE_ENV: "production" } as NodeJS.ProcessEnv),
    ).toBe(false);
  });

  test("falls back to NODE_ENV off Vercel", () => {
    expect(isProductionRuntime({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toBe(true);
    expect(isProductionRuntime({ NODE_ENV: "development" } as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe("assertTurnstileConfig", () => {
  test("does nothing outside production, even when inconsistent", () => {
    expect(() =>
      assertTurnstileConfig({ siteKey: "sk", secret: undefined, isProduction: false }),
    ).not.toThrow();
  });

  test("passes in production when both keys are set", () => {
    expect(() =>
      assertTurnstileConfig({ siteKey: "site", secret: "secret", isProduction: true }),
    ).not.toThrow();
  });

  test("passes in production when neither key is set (Turnstile intentionally off)", () => {
    expect(() =>
      assertTurnstileConfig({ siteKey: undefined, secret: undefined, isProduction: true }),
    ).not.toThrow();
  });

  test("throws in production when only the secret is set (would 403 every submission)", () => {
    expect(() =>
      assertTurnstileConfig({ siteKey: undefined, secret: "secret", isProduction: true }),
    ).toThrow(/Turnstile misconfiguration/);
  });

  test("throws in production when only the site key is set (would silently disable CAPTCHA)", () => {
    expect(() =>
      assertTurnstileConfig({ siteKey: "site", secret: "", isProduction: true }),
    ).toThrow(/Turnstile misconfiguration/);
  });
});
