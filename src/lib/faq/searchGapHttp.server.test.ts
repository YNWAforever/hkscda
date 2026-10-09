import { describe, expect, mock, test } from "bun:test";
import { z } from "zod";

import type { RateLimitResult } from "../security/rate-limit.server";
import { createSearchGapBeaconHandler } from "./searchGapHttp.server";

const validBody = JSON.stringify({ topic: "visa", language: "en", confidence: "none" });

function createHandler(
  overrides: {
    rateLimit?: RateLimitResult;
    record?: (input: unknown) => Promise<"recorded" | "dropped">;
  } = {},
) {
  const rateLimit = mock(async (_request: Request): Promise<RateLimitResult> => {
    return overrides.rateLimit ?? { ok: true };
  });
  const record = mock(overrides.record ?? (async (_input: unknown) => "recorded" as const));
  const error = mock((..._args: unknown[]) => {});
  const handler = createSearchGapBeaconHandler({ rateLimit, record, log: { error } });
  return { handler, rateLimit, record, error };
}

function post(body: BodyInit | null, contentType: string | null = "application/json") {
  const headers = new Headers();
  if (contentType !== null) headers.set("content-type", contentType);
  return new Request("https://example.test/api/help/search-gap", {
    method: "POST",
    headers,
    body,
  });
}

describe("createSearchGapBeaconHandler", () => {
  test("answers 429 with retry-after when over the limit, without recording", async () => {
    const { handler, record } = createHandler({
      rateLimit: { ok: false, reset: Date.now() + 30_000 },
    });

    const response = await handler(post(validBody));

    expect(response.status).toBe(429);
    const retryAfter = Number(response.headers.get("retry-after"));
    expect(retryAfter).toBeGreaterThanOrEqual(29);
    expect(retryAfter).toBeLessThanOrEqual(30);
    expect(record).not.toHaveBeenCalled();
  });

  test("rate limits before reading the body", async () => {
    const { handler, rateLimit } = createHandler({ rateLimit: { ok: false } });
    const request = post(validBody);

    await handler(request);

    expect(rateLimit).toHaveBeenCalledWith(request);
    expect(request.bodyUsed).toBe(false);
  });

  test("rejects a non-JSON content type with 415", async () => {
    const { handler, record } = createHandler();

    const response = await handler(post(validBody, "text/plain"));

    expect(response.status).toBe(415);
    expect(record).not.toHaveBeenCalled();
  });

  test("rejects a missing content type with 415", async () => {
    const { handler } = createHandler();

    // A byte body (unlike a string) gets no default content-type from Request.
    const request = post(new TextEncoder().encode(validBody), null);
    expect(request.headers.has("content-type")).toBe(false);

    expect((await handler(request)).status).toBe(415);
  });

  test("accepts a JSON content type with a charset parameter and any casing", async () => {
    const { handler, record } = createHandler();

    const response = await handler(post(validBody, "Application/JSON; charset=utf-8"));

    expect(response.status).toBe(204);
    expect(record).toHaveBeenCalledTimes(1);
  });

  test("rejects a body over 1024 bytes with 413", async () => {
    const { handler, record } = createHandler();

    const response = await handler(post("x".repeat(1025)));

    expect(response.status).toBe(413);
    expect(record).not.toHaveBeenCalled();
  });

  test("accepts a body of exactly 1024 bytes", async () => {
    const { handler, record } = createHandler();
    const padded = validBody.slice(0, -1) + " ".repeat(1024 - validBody.length) + "}";
    expect(new TextEncoder().encode(padded).byteLength).toBe(1024);

    const response = await handler(post(padded));

    expect(response.status).toBe(204);
    expect(record).toHaveBeenCalledTimes(1);
  });

  test("rejects invalid JSON with 400", async () => {
    const { handler, record } = createHandler();

    const response = await handler(post("{not json"));

    expect(response.status).toBe(400);
    expect(record).not.toHaveBeenCalled();
  });

  test("hands the parsed JSON to record untouched", async () => {
    const { handler, record } = createHandler();

    await handler(post(validBody));

    expect(record).toHaveBeenCalledWith({ topic: "visa", language: "en", confidence: "none" });
  });

  test("answers 400 when record throws a ZodError", async () => {
    const { handler, error } = createHandler({
      record: async () => {
        throw new z.ZodError([]);
      },
    });

    const response = await handler(post(validBody));

    expect(response.status).toBe(400);
    expect(error).not.toHaveBeenCalled();
  });

  test("answers 204 and records nothing more when record drops the topic", async () => {
    const { handler, error } = createHandler({ record: async () => "dropped" });

    const response = await handler(post(validBody));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(error).not.toHaveBeenCalled();
  });

  test("answers 204 and logs once when record throws an unexpected error", async () => {
    const failure = new Error("database is down");
    const { handler, error } = createHandler({
      record: async () => {
        throw failure;
      },
    });

    const response = await handler(post(validBody));

    expect(response.status).toBe(204);
    expect(await response.text()).toBe("");
    expect(error).toHaveBeenCalledTimes(1);
    expect(error).toHaveBeenCalledWith("FAQ search gap record failed", failure);
  });

  test("answers 204 with an empty body on success", async () => {
    const { handler, error } = createHandler();

    const response = await handler(post(validBody));

    expect(response.status).toBe(204);
    expect(response.body).toBeNull();
    expect(error).not.toHaveBeenCalled();
  });
});
