import { describe, expect, test } from "bun:test";

import {
  repairAnimalPublicationMedia,
  type AnimalPublicationMediaRepairPort,
  type ClaimedAnimalPublicationMedia,
} from "./publicationMediaRepair.server";

const row: ClaimedAnimalPublicationMedia = {
  sourcePath: "11111111-2222-4333-8444-555555555555/draft.jpg",
  publicPath: "11111111-2222-4333-8444-555555555555/versions/preview.jpg",
  claimedAt: "2026-09-26T00:00:00Z",
  leaseToken: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee",
  attempts: 1,
};
function fixture(rows: ClaimedAnimalPublicationMedia[]) {
  const calls: string[] = [];
  const pending = [...rows];
  const port: AnimalPublicationMediaRepairPort = {
    claim: async (limit) => {
      expect(limit).toBe(1);
      const next = pending.shift();
      return next ? [next] : [];
    },
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
  return { port, calls, pending };
}

describe("animal publication media repair", () => {
  test("copies and acknowledges only a claimed committed image", async () => {
    const { port, calls } = fixture([row]);
    expect(await repairAnimalPublicationMedia(port)).toEqual({ copied: 1, failed: 0 });
    expect(calls).toEqual(["copy", "ready"]);
  });

  test("schedules a storage failure with a safe error code and injected clock", async () => {
    const { port } = fixture([row]);
    let failure: { at: string; code: string } | null = null;
    port.copy = async () => {
      throw new Error("private storage path must not be logged");
    };
    port.markFailure = async (_item, at, code) => {
      failure = { at, code };
      return true;
    };
    const now = new Date("2026-09-27T00:00:00.000Z");
    expect(
      await repairAnimalPublicationMedia(port, { error: () => {} }, { now: () => now }),
    ).toEqual({ copied: 0, failed: 1 });
    expect(failure as unknown).toEqual({ at: "2026-09-27T00:01:00.000Z", code: "copy_failed" });
  });

  test("a lost lease cannot acknowledge or reschedule another worker's claim", async () => {
    const { port } = fixture([row]);
    let failures = 0;
    port.markReady = async () => false;
    port.markFailure = async () => {
      failures++;
      return true;
    };
    expect(await repairAnimalPublicationMedia(port, { error: () => {} })).toEqual({
      copied: 0,
      failed: 1,
    });
    expect(failures).toBe(0);
  });

  test("a single worker has a hard item cap and stops on its time budget", async () => {
    const rows = Array.from({ length: 500 }, (_, index) => ({
      ...row,
      publicPath: row.publicPath + index,
    }));
    const { port, pending } = fixture(rows);
    expect(
      await repairAnimalPublicationMedia(port, { error: () => {} }, { now: () => new Date(0) }),
    ).toEqual({ copied: 20, failed: 0 });
    expect(pending).toHaveLength(480);
    let tick = 0;
    const second = fixture(rows);
    expect(
      await repairAnimalPublicationMedia(
        second.port,
        { error: () => {} },
        {
          now: () => new Date(tick++),
          timeBudgetMs: 3,
        },
      ),
    ).toEqual({ copied: 2, failed: 0 });
    expect(second.pending).toHaveLength(498);
  });
});
