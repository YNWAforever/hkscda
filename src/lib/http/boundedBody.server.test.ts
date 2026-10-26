import { describe, expect, test } from "bun:test";

import { readBoundedBytes, readBoundedText } from "./boundedBody.server";
import { readPaymentWebhookBody } from "../donations/webhookBody.server";
import {
  InvalidRequestJsonError,
  RequestBodyTooLargeError,
  readPublicJson,
} from "./publicJson.server";

function streamedRequest(chunks: Uint8Array[], headers?: HeadersInit) {
  let next = 0;
  let cancelled = false;
  const body = new ReadableStream<Uint8Array>(
    {
      pull(controller) {
        if (next === chunks.length) controller.close();
        else controller.enqueue(chunks[next++]);
      },
      cancel() {
        cancelled = true;
      },
    },
    { highWaterMark: 0 },
  );
  return {
    request: new Request("https://example.test/", { method: "POST", body, headers }),
    body,
    consumedChunks: () => next,
    wasCancelled: () => cancelled,
  };
}

describe("bounded request bodies", () => {
  test("rejects an oversized declared length without consuming the stream", async () => {
    const input = streamedRequest([new Uint8Array([1])], { "content-length": "5" });
    expect(await readBoundedBytes(input.request, 4)).toBeNull();
    expect(input.consumedChunks()).toBe(0);
  });

  test("accepts exactly the byte limit and preserves binary bytes across chunks", async () => {
    const input = streamedRequest([new Uint8Array([0, 255]), new Uint8Array([128, 1])]);
    expect(await readBoundedBytes(input.request, 4)).toEqual(new Uint8Array([0, 255, 128, 1]));
    expect(input.body.locked).toBe(false);
  });

  for (const headers of [undefined, { "content-length": "1" }, { "content-length": "invalid" }]) {
    test(`cancels actual overflow with ${headers?.["content-length"] ?? "no"} declared length`, async () => {
      const input = streamedRequest(
        [new Uint8Array(3), new Uint8Array(2), new Uint8Array(8)],
        headers,
      );
      expect(await readBoundedBytes(input.request, 4)).toBeNull();
      expect(input.wasCancelled()).toBe(true);
      expect(input.consumedChunks()).toBe(2);
      expect(input.body.locked).toBe(false);
    });
  }

  test("decodes UTF-8 only after joining chunks and counts bytes rather than characters", async () => {
    const bytes = new TextEncoder().encode("貓");
    expect(
      await readBoundedText(streamedRequest([bytes.slice(0, 1), bytes.slice(1)]).request, 3),
    ).toBe("貓");
    expect(await readBoundedText(streamedRequest([bytes]).request, 2)).toBeNull();
  });

  test("returns empty bytes for an absent body", async () => {
    expect(await readBoundedBytes(new Request("https://example.test/"), 4)).toEqual(
      new Uint8Array(),
    );
  });

  test("propagates interrupted uploads and releases the reader lock", async () => {
    const body = new ReadableStream<Uint8Array>({
      pull(controller) {
        controller.error(new Error("upload interrupted"));
      },
    });
    const request = new Request("https://example.test/", { method: "POST", body });
    await expect(readBoundedBytes(request, 4)).rejects.toThrow("upload interrupted");
    expect(body.locked).toBe(false);
  });
});

describe("public form and payment body contracts", () => {
  test("public JSON accepts a chunked form payload", async () => {
    const encode = (text: string) => new TextEncoder().encode(text);
    expect(
      await readPublicJson(streamedRequest([encode('{"name":"'), encode('貓"}')]).request),
    ).toEqual({ name: "貓" });
  });

  test("public JSON distinguishes malformed input from an oversized body", async () => {
    await expect(
      readPublicJson(new Request("https://example.test/", { method: "POST", body: "{" })),
    ).rejects.toBeInstanceOf(InvalidRequestJsonError);
    // A syntactically valid prefix must not turn a truncated oversized body into accepted JSON.
    const input = streamedRequest([new TextEncoder().encode("{}"), new Uint8Array(1024 * 1024)]);
    await expect(readPublicJson(input.request)).rejects.toBeInstanceOf(RequestBodyTooLargeError);
    expect(input.wasCancelled()).toBe(true);
  });

  test("preserves signed payment payload whitespace and Unicode without JSON reserialization", async () => {
    const raw = ' { "event": "貓", "amount": 100 }\n';
    const bytes = new TextEncoder().encode(raw);
    expect(
      await readPaymentWebhookBody(streamedRequest([bytes.slice(0, 4), bytes.slice(4)]).request),
    ).toBe(raw);
  });

  test("payment webhooks accept the limit but reject a chunked body one byte over it", async () => {
    const atLimit = " ".repeat(2 * 1024 * 1024);
    expect(
      await readPaymentWebhookBody(
        new Request("https://example.test/", { method: "POST", body: atLimit }),
      ),
    ).toBe(atLimit);
    const input = streamedRequest([new TextEncoder().encode(atLimit), new Uint8Array([32])]);
    expect(await readPaymentWebhookBody(input.request)).toBeNull();
    expect(input.wasCancelled()).toBe(true);
  });
});
