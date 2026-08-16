import { describe, expect, test } from "bun:test";

import { pollDonationDefaults, pollDonationSucceeded } from "./publicStatus";

describe("pollDonationSucceeded", () => {
  test("defaults to a 15-minute polling window", () => {
    expect(pollDonationDefaults).toEqual({ attempts: 90, delayMs: 10_000, deadlineMs: 900_000 });
  });

  test("stops when the server confirms success", async () => {
    const states = ["pending", "succeeded"] as const;
    let calls = 0;

    const result = await pollDonationSucceeded("donation-1", {
      attempts: 4,
      delayMs: 0,
      load: async () => ({ status: states[calls++] ?? "pending" }),
    });

    expect(result).toBe(true);
    expect(calls).toBe(2);
  });

  test("stops on terminal failure without extra attempts", async () => {
    let calls = 0;

    const result = await pollDonationSucceeded("donation-1", {
      attempts: 4,
      delayMs: 0,
      load: async () => {
        calls += 1;
        return { status: "failed" };
      },
    });

    expect(result).toBe(false);
    expect(calls).toBe(1);
  });

  test("caps pending polling at the 15-minute window without an extra request", async () => {
    let calls = 0;

    const result = await pollDonationSucceeded("donation-1", {
      attempts: 99,
      delayMs: 0,
      load: async () => {
        calls += 1;
        return { status: "pending" };
      },
    });

    expect(result).toBe(false);
    expect(calls).toBe(90);
  });

  test("loads a confirmed status from the no-store donation status endpoint", async () => {
    const originalFetch = globalThis.fetch;
    let requestedUrl = "";
    let requestedCache: RequestCache | undefined;
    globalThis.fetch = (async (input, init) => {
      requestedUrl = String(input);
      requestedCache = init?.cache;
      return Response.json({ status: "succeeded" });
    }) as typeof fetch;

    try {
      await expect(pollDonationSucceeded("donation-1", { attempts: 1 })).resolves.toBe(true);
      expect(requestedUrl).toBe("/api/donations/donation-1/status");
      expect(requestedCache).toBe("no-store");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  test("stops when the server reports a refund", async () => {
    let calls = 0;

    const result = await pollDonationSucceeded("donation-1", {
      attempts: 90,
      delayMs: 0,
      load: async () => {
        calls += 1;
        return { status: "refunded" };
      },
    });

    expect(result).toBe(false);
    expect(calls).toBe(1);
  });

  test("retries a transient status request failure within the deadline", async () => {
    let calls = 0;
    const result = await pollDonationSucceeded("donation-1", {
      attempts: 4,
      delayMs: 0,
      load: async () => {
        calls += 1;
        if (calls === 1) throw new Error("network down");
        return { status: "succeeded" };
      },
    });

    expect(result).toBe(true);
    expect(calls).toBe(2);
  });

  test("uses an absolute deadline and caps the final delay", async () => {
    let now = 0;
    let calls = 0;
    const sleeps: number[] = [];
    const result = await pollDonationSucceeded("donation-1", {
      attempts: 90,
      delayMs: 60,
      deadlineMs: 100,
      now: () => now,
      sleep: async (delay) => {
        sleeps.push(delay);
        now += delay;
      },
      load: async () => {
        calls += 1;
        return { status: "pending" };
      },
    });

    expect(result).toBe(false);
    expect(calls).toBe(2);
    expect(sleeps).toEqual([60, 40]);
  });

  test("passes cancellation to the request and stops after abort", async () => {
    const controller = new AbortController();
    let calls = 0;
    let receivedSignal: AbortSignal | undefined;
    const result = await pollDonationSucceeded("donation-1", {
      attempts: 90,
      delayMs: 0,
      signal: controller.signal,
      load: async (_donationId, { signal } = {}) => {
        calls += 1;
        receivedSignal = signal;
        controller.abort();
        throw new DOMException("aborted", "AbortError");
      },
    });

    expect(result).toBe(false);
    expect(calls).toBe(1);
    expect(receivedSignal).not.toBe(controller.signal);
    expect(receivedSignal?.aborted).toBe(true);
  });

  test("aborts an in-flight status request at the absolute deadline", async () => {
    let receivedSignal: AbortSignal | undefined;
    const result = await pollDonationSucceeded("donation-1", {
      attempts: 1,
      deadlineMs: 20,
      load: async (_donationId, { signal } = {}) => {
        receivedSignal = signal;
        return new Promise((resolve) => {
          signal?.addEventListener("abort", () => resolve({ status: "pending" }));
        });
      },
    });

    expect(result).toBe(false);
    expect(receivedSignal?.aborted).toBe(true);
  });
});
