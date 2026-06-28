import { describe, expect, test } from "bun:test";

import { verifyTurnstile } from "./turnstile.server";

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
