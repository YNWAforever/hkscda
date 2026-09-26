import { describe, expect, test } from "bun:test";

import {
  cleanupExpiredSponsorshipProofUploads,
  type SponsorshipProofCleanupPort,
} from "./proofCleanup.server";

function setup(
  referenced: boolean,
  removeError?: Error,
  finishError?: Error,
  referenceError?: Error,
) {
  const calls: string[] = [];
  const row = {
    pledgeId: "cccccccc-dddd-4eee-8fff-000000000000",
    storagePath: "cccccccc-dddd-4eee-8fff-000000000000/proof/receipt.jpg",
    claimedAt: "2026-09-26T00:00:00Z",
  };
  const port: SponsorshipProofCleanupPort = {
    claim: async () => [row],
    isReferenced: async () => {
      calls.push("check");
      if (referenceError) throw referenceError;
      return referenced;
    },
    remove: async () => {
      calls.push("remove");
      if (removeError) throw removeError;
    },
    preserve: async () => {
      calls.push("preserve");
    },
    finish: async () => {
      calls.push("finish");
      if (finishError) throw finishError;
    },
    release: async () => {
      calls.push("release");
    },
  };
  return { port, calls };
}

describe("expired sponsorship proof cleanup", () => {
  test("removes only a claimed unreferenced proof", async () => {
    const { port, calls } = setup(false);
    expect(await cleanupExpiredSponsorshipProofUploads(port)).toEqual({
      removed: 1,
      preserved: 0,
      failed: 0,
    });
    expect(calls).toEqual(["check", "remove", "finish"]);
  });

  test("preserves a proof already referenced by a pledge", async () => {
    const { port, calls } = setup(true);
    expect(await cleanupExpiredSponsorshipProofUploads(port)).toEqual({
      removed: 0,
      preserved: 1,
      failed: 0,
    });
    expect(calls).toEqual(["check", "preserve"]);
  });

  test("releases a claim if reference lookup fails before any Storage delete", async () => {
    const { port, calls } = setup(false, undefined, undefined, new Error("database unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredSponsorshipProofUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({
      removed: 0,
      preserved: 0,
      failed: 1,
    });
    expect(calls).toEqual(["check", "release"]);
    expect(errors).toHaveLength(1);
  });

  test("keeps the claim after an ambiguous Storage removal failure", async () => {
    const { port, calls } = setup(false, new Error("storage unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredSponsorshipProofUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({
      removed: 0,
      preserved: 0,
      failed: 1,
    });
    expect(calls).toEqual(["check", "remove"]);
    expect(errors).toHaveLength(1);
  });

  test("keeps the claim after Storage removal if completion fails", async () => {
    const { port, calls } = setup(false, undefined, new Error("database unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredSponsorshipProofUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({
      removed: 0,
      preserved: 0,
      failed: 1,
    });
    expect(calls).toEqual(["check", "remove", "finish"]);
    expect(errors).toHaveLength(1);
  });
});
