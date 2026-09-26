import { describe, expect, test } from "bun:test";

import {
  cleanupExpiredAnimalDraftUploads,
  type AnimalDraftUploadCleanupPort,
} from "./draftUploadCleanup.server";

const row = {
  animalId: "11111111-2222-4333-8444-555555555555",
  storagePath: "11111111-2222-4333-8444-555555555555/version-1/draft.jpg",
  claimedAt: "2026-09-26T00:00:00Z",
};

function setup(removeError?: Error, finishError?: Error) {
  const calls: string[] = [];
  const port: AnimalDraftUploadCleanupPort = {
    claim: async () => [row],
    remove: async () => {
      calls.push("remove");
      if (removeError) throw removeError;
    },
    finish: async () => {
      calls.push("finish");
      if (finishError) throw finishError;
    },
  };
  return { port, calls };
}

describe("animal draft upload cleanup", () => {
  test("removes a claimed unattached upload", async () => {
    const { port, calls } = setup();
    expect(await cleanupExpiredAnimalDraftUploads(port)).toEqual({ removed: 1, failed: 0 });
    expect(calls).toEqual(["remove", "finish"]);
  });

  test("keeps a claim when a Storage deletion response is ambiguous", async () => {
    const { port, calls } = setup(new Error("storage unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredAnimalDraftUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({ removed: 0, failed: 1 });
    expect(calls).toEqual(["remove"]);
    expect(errors).toHaveLength(1);
  });

  test("keeps a claim after Storage removal if finishing fails", async () => {
    const { port, calls } = setup(undefined, new Error("database unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredAnimalDraftUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({ removed: 0, failed: 1 });
    expect(calls).toEqual(["remove", "finish"]);
    expect(errors).toHaveLength(1);
  });
});
