import { describe, expect, test } from "bun:test";

import {
  cleanupExpiredSponsorshipProofUploads,
  type SponsorshipProofCleanupPort,
} from "./proofCleanup.server";

function setup(referenced: boolean, removeError?: Error) {
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

  test("releases a claim when Storage removal fails so a later run can retry", async () => {
    const { port, calls } = setup(false, new Error("storage unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredSponsorshipProofUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({
      removed: 0,
      preserved: 0,
      failed: 1,
    });
    expect(calls).toEqual(["check", "remove", "release"]);
    expect(errors).toHaveLength(1);
  });
});
