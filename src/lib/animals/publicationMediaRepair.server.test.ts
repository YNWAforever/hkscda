import { describe, expect, test } from "bun:test";

import {
  repairAnimalPublicationMedia,
  type AnimalPublicationMediaRepairPort,
} from "./publicationMediaRepair.server";

const row = {
  sourcePath: "11111111-2222-4333-8444-555555555555/draft.jpg",
  publicPath: "11111111-2222-4333-8444-555555555555/versions/preview.jpg",
  claimedAt: "2026-09-26T00:00:00Z",
};

describe("animal publication media repair", () => {
  test("copies a committed pending image", async () => {
    const calls: string[] = [];
    const port: AnimalPublicationMediaRepairPort = {
      claim: async () => [row],
      copy: async () => {
        calls.push("copy");
      },
    };
    expect(await repairAnimalPublicationMedia(port)).toEqual({ copied: 1, failed: 0 });
    expect(calls).toEqual(["copy"]);
  });

  test("reports an ambiguous copy failure so the claim can expire and retry", async () => {
    const errors: unknown[] = [];
    const port: AnimalPublicationMediaRepairPort = {
      claim: async () => [row],
      copy: async () => {
        throw new Error("storage response unavailable");
      },
    };
    expect(
      await repairAnimalPublicationMedia(port, { error: (...args) => errors.push(args) }),
    ).toEqual({ copied: 0, failed: 1 });
    expect(errors).toHaveLength(1);
  });
});
