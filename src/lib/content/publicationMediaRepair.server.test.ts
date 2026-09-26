import { expect, test } from "bun:test";
import {
  repairContentPublicationMedia,
  type ContentPublicationMediaRepairPort,
} from "./publicationMediaRepair.server";

const row = {
  id: "f2bb923f-c838-444f-ad1e-88d99b0da9d6",
  sourceBucket: "content-media-private",
  sourcePath: "private.png",
  publicBucket: "content-media",
  publicPath: "published/revision.png",
  sha256: "a".repeat(64),
  ready: false,
  claimedAt: "2026-09-26T00:00:00Z",
};

test("repairs a committed content publication copy and marks its claim ready", async () => {
  const calls: string[] = [];
  const port: ContentPublicationMediaRepairPort = {
    claim: async () => [row],
    copy: async () => {
      calls.push("copy");
    },
    markReady: async () => {
      calls.push("mark");
      return true;
    },
  };
  expect(await repairContentPublicationMedia(port)).toEqual({ copied: 1, failed: 0 });
  expect(calls).toEqual(["copy", "mark"]);
});

test("failed copy remains pending and is reported to the scheduler", async () => {
  let marked = false;
  const port: ContentPublicationMediaRepairPort = {
    claim: async () => [row],
    copy: async () => {
      throw new Error("Storage unavailable");
    },
    markReady: async () => {
      marked = true;
      return true;
    },
  };
  expect(await repairContentPublicationMedia(port, { error: () => {} })).toEqual({
    copied: 0,
    failed: 1,
  });
  expect(marked).toBe(false);
});
