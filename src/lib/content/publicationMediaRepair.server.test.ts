import { expect, test } from "bun:test";
import {
  repairContentPublicationMedia,
  type ContentPublicationMediaRepairPort,
} from "./publicationMediaRepair.server";

const row = {
  id: "f2bb923f-c838-444f-ad1e-88d99b0da9d6",
  sourceBucket: "content-media-private" as const,
  sourcePath: "private.png",
  publicBucket: "content-media" as const,
  publicPath: "published/revision.png",
  sha256: "a".repeat(64),
  ready: false,
  claimedAt: "2026-09-26T00:00:00Z",
  leaseToken: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  attempts: 2,
};

test("content repair copies then acknowledges the current lease", async () => {
  const calls: string[] = [];
  const rows = [row];
  const port: ContentPublicationMediaRepairPort = {
    claim: async () => rows.splice(0, 1),
    copy: async () => {
      calls.push("copy");
    },
    markReady: async () => {
      calls.push("ready");
      return true;
    },
    markFailure: async () => {
      calls.push("failure");
      return true;
    },
  };
  expect(await repairContentPublicationMedia(port)).toEqual({ copied: 1, failed: 0 });
  expect(calls).toEqual(["copy", "ready"]);
});

test("content failure is rescheduled and not marked ready", async () => {
  const rows = [row];
  let marked = false;
  let retry: { at: string; code: string } | null = null;
  const port: ContentPublicationMediaRepairPort = {
    claim: async () => rows.splice(0, 1),
    copy: async () => {
      throw new Error("Storage unavailable");
    },
    markReady: async () => {
      marked = true;
      return true;
    },
    markFailure: async (_item, at, code) => {
      retry = { at, code };
      return true;
    },
  };
  expect(
    await repairContentPublicationMedia(
      port,
      { error: () => {} },
      {
        now: () => new Date("2026-09-27T00:00:00.000Z"),
      },
    ),
  ).toEqual({ copied: 0, failed: 1 });
  expect(marked).toBe(false);
  expect(retry as unknown).toEqual({ at: "2026-09-27T00:05:00.000Z", code: "copy_failed" });
});

test("content lease loss never marks another worker's result failed", async () => {
  const rows = [row];
  let failed = false;
  const port: ContentPublicationMediaRepairPort = {
    claim: async () => rows.splice(0, 1),
    copy: async () => {},
    markReady: async () => false,
    markFailure: async () => {
      failed = true;
      return true;
    },
  };
  expect(await repairContentPublicationMedia(port, { error: () => {} })).toEqual({
    copied: 0,
    failed: 1,
  });
  expect(failed).toBe(false);
});
