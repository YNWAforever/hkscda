import { describe, expect, test } from "bun:test";

import { pollDonationDefaults, pollDonationSucceeded } from "./publicStatus";

describe("pollDonationSucceeded", () => {
  test("defaults to a 15-minute polling window", () => {
    expect(pollDonationDefaults).toEqual({ attempts: 90, delayMs: 10_000 });
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

  test("returns false when a status request fails", async () => {
    const result = await pollDonationSucceeded("donation-1", {
      attempts: 4,
      delayMs: 0,
      load: async () => {
        throw new Error("network down");
      },
    });

    expect(result).toBe(false);
  });
});
