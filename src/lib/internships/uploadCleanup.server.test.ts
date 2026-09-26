import { describe, expect, test } from "bun:test";

import {
  cleanupExpiredInternshipUploads,
  type InternshipUploadCleanupPort,
} from "./uploadCleanup.server";

function setup(
  referenced: boolean,
  removeError?: Error,
  finishError?: Error,
  referenceError?: Error,
) {
  const calls: string[] = [];
  const row = {
    storagePath: "actor/application/upload-key",
    claimedAt: "2026-09-26T00:00:00Z",
  };
  const port: InternshipUploadCleanupPort = {
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

describe("expired internship attachment cleanup", () => {
  test("removes a claimed upload only if no attachment references it", async () => {
    const { port, calls } = setup(false);
    expect(await cleanupExpiredInternshipUploads(port)).toEqual({
      removed: 1,
      preserved: 0,
      failed: 0,
    });
    expect(calls).toEqual(["check", "remove", "finish"]);
  });

  test("preserves an upload that an application references", async () => {
    const { port, calls } = setup(true);
    expect(await cleanupExpiredInternshipUploads(port)).toEqual({
      removed: 0,
      preserved: 1,
      failed: 0,
    });
    expect(calls).toEqual(["check", "preserve"]);
  });

  test("releases the claim if reference lookup fails before any Storage delete", async () => {
    const { port, calls } = setup(false, undefined, undefined, new Error("database unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredInternshipUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({ removed: 0, preserved: 0, failed: 1 });
    expect(calls).toEqual(["check", "release"]);
    expect(errors).toHaveLength(1);
  });

  test("keeps the claim after an ambiguous Storage removal failure", async () => {
    const { port, calls } = setup(false, new Error("storage unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredInternshipUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({ removed: 0, preserved: 0, failed: 1 });
    expect(calls).toEqual(["check", "remove"]);
    expect(errors).toHaveLength(1);
  });

  test("keeps the claim after Storage removal if completion fails", async () => {
    const { port, calls } = setup(false, undefined, new Error("database unavailable"));
    const errors: unknown[] = [];
    expect(
      await cleanupExpiredInternshipUploads(port, { error: (...args) => errors.push(args) }),
    ).toEqual({
      removed: 0,
      preserved: 0,
      failed: 1,
    });
    expect(calls).toEqual(["check", "remove", "finish"]);
    expect(errors).toHaveLength(1);
  });
});
