import { describe, expect, test } from "bun:test";
import {
  hongKongDayRange,
  createOverviewHandler,
  failedOverviewStats,
  mergeOverviewStats,
  type OverviewData,
} from "./overview";
import { volunteerServerErrorText } from "./serverErrors";
describe("volunteer overview", () => {
  test("uses Hong Kong day boundaries across UTC month end", () => {
    expect(hongKongDayRange(new Date("2026-09-30T18:00:00Z"))).toEqual({
      date: "2026-10-01",
      from: "2026-10-01T00:00:00+08:00",
      until: "2026-10-02T00:00:00+08:00",
    });
  });
  test("does not read data before authorization", async () => {
    let read = false;
    const handler = createOverviewHandler({
      authorize: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      read: async () => {
        read = true;
        return { pendingProfiles: 0, pendingRegistrations: 0, todayActivities: 0 };
      },
    });
    expect((await handler(new Request("https://example.invalid"))).status).toBe(403);
    expect(read).toBe(false);
  });
  test("authorizes before reading private coverage and keeps read failure unknown", async () => {
    let coverageReads = 0;
    const denied = createOverviewHandler({
      authorize: async () => {
        throw new Response("Forbidden", { status: 403 });
      },
      read: async () => ({ pendingProfiles: 0, pendingRegistrations: 0, todayActivities: 0 }),
      readCoverage: async () => {
        coverageReads++;
        throw new Error("should not read");
      },
    });
    expect((await denied(new Request("https://example.invalid"))).status).toBe(403);
    expect(coverageReads).toBe(0);

    const allowed = createOverviewHandler({
      authorize: async () => {},
      read: async () => ({ pendingProfiles: 0, pendingRegistrations: 0, todayActivities: 0 }),
      readCoverage: async () => {
        coverageReads++;
        throw new Error("isolated coverage read failed");
      },
    });
    const response = await allowed(new Request("https://example.invalid?centre=cat"));
    expect(response.status).toBe(200);
    expect((await response.json()).coverage).toBeNull();
    expect(coverageReads).toBe(1);
  });

  test("rejects malformed centre after authorization without reading data", async () => {
    let reads = 0;
    const handler = createOverviewHandler({
      authorize: async () => {},
      read: async () => {
        reads++;
        return { pendingProfiles: 0, pendingRegistrations: 0, todayActivities: 0 };
      },
    });
    const response = await handler(new Request("https://example.invalid?centre=cat%2Cdog"));
    expect(response.status).toBe(400);
    expect(reads).toBe(0);
  });

  test("keeps unavailable counts distinct from zero", async () => {
    const handler = createOverviewHandler(
      {
        authorize: async () => {},
        read: async () => ({ pendingProfiles: null, pendingRegistrations: 0, todayActivities: 4 }),
      },
      () => new Date("2026-10-01T01:00:00Z"),
    );
    const response = await handler(new Request("https://example.invalid"));
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({
      date: "2026-10-01",
      counts: { pendingProfiles: null, pendingRegistrations: 0, todayActivities: 4 },
    });
  });
});

describe("the overview's messages", () => {
  test("still answer in Chinese, word for word, from the table that also gives the English", async () => {
    const handler = createOverviewHandler({
      authorize: async () => {},
      read: async () => {
        throw new Error("down");
      },
    });
    const invalid = await handler(new Request("https://example.invalid?centre=NOT%20VALID"));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toEqual({ error: "服務地點無效" });
    const failed = await handler(new Request("https://example.invalid"));
    expect(failed.status).toBe(500);
    expect(await failed.json()).toEqual({ error: "未能載入營運總覽，請重試。" });
    expect(volunteerServerErrorText("overview_invalid_centre")).toBe("服務地點無效");
    expect(volunteerServerErrorText("overview_load_failed")).toBe("未能載入營運總覽，請重試。");
  });
});

describe("selected overview statistics", () => {
  test("only null statistics are retried and unselected data stays intact", () => {
    const previous: OverviewData = {
      date: "2026-10-25",
      counts: { pendingProfiles: 0, pendingRegistrations: null, todayActivities: 3 },
      runtimeHealth: {
        state: "degraded",
        lastSuccessAt: null,
        lastFailureAt: null,
        consecutiveFailures: 2,
      },
    };
    const update: OverviewData = {
      date: "2026-10-25",
      counts: { pendingProfiles: 999, pendingRegistrations: 11, todayActivities: 999 },
    };
    expect(failedOverviewStats(previous.counts)).toEqual(["pendingRegistrations"]);
    expect(mergeOverviewStats(previous, update, ["pendingRegistrations"])).toEqual({
      ...previous,
      counts: {
        pendingProfiles: 0,
        pendingRegistrations: 11,
        todayActivities: 3,
        pendingBreakdown: null,
      },
    });
    expect(
      mergeOverviewStats(previous, { ...update, date: "2026-10-26" }, ["pendingRegistrations"]),
    ).toBe(previous);
  });
  test("validates the selection after authorization before any read", async () => {
    let reads = 0;
    const handler = createOverviewHandler({
      authorize: async () => {},
      read: async () => {
        reads++;
        return { pendingProfiles: 0, pendingRegistrations: 0, todayActivities: 0 };
      },
    });
    for (const selection of [
      "",
      "unknown",
      "pendingProfiles,pendingProfiles",
      "pendingProfiles,unknown",
      "pendingProfiles&stats=todayActivities",
    ]) {
      expect(
        (await handler(new Request("https://example.invalid?stats=" + selection))).status,
      ).toBe(400);
    }
    expect(reads).toBe(0);
  });

  test("a selected-stat retry does no unrelated optional reads", async () => {
    let requested: readonly string[] | undefined;
    let optionalReads = 0;
    const handler = createOverviewHandler({
      authorize: async () => {},
      read: async (_range, _snapshot, selected) => {
        requested = selected;
        return { pendingProfiles: null, pendingRegistrations: 11, todayActivities: null };
      },
      readCoverage: async () => {
        optionalReads++;
        throw new Error("should not read");
      },
      readHealth: async () => {
        optionalReads++;
        throw new Error("should not read");
      },
    });
    const response = await handler(
      new Request("https://example.invalid?stats=pendingRegistrations"),
    );
    expect(response.status).toBe(200);
    expect(requested).toEqual(["pendingRegistrations"]);
    expect(optionalReads).toBe(0);
    expect(await response.json()).not.toHaveProperty("runtimeHealth");
  });
});

describe("optional overview reads", () => {
  const counts = { pendingProfiles: 7, pendingRegistrations: 11, todayActivities: 3 };
  const unknownHealth = {
    state: "unknown",
    lastSuccessAt: null,
    lastFailureAt: null,
    consecutiveFailures: 0,
  };

  test("a successful optional read clears its deadline without later aborting", async () => {
    let signal: AbortSignal | undefined;
    const failures: string[] = [];
    const handler = createOverviewHandler(
      {
        authorize: async () => {},
        read: async () => counts,
        readHealth: async (incoming) => {
          signal = incoming;
          return {
            state: "healthy",
            lastSuccessAt: "2026-10-25T02:15:00Z",
            lastFailureAt: null,
            consecutiveFailures: 0,
          };
        },
        reportFailure: (part) => failures.push(part),
      },
      () => new Date("2026-10-25T03:00:00Z"),
      10,
    );
    const response = await handler(new Request("https://example.invalid"));
    expect((await response.json()).runtimeHealth.state).toBe("healthy");
    await new Promise((resolve) => setTimeout(resolve, 30));
    expect(signal?.aborted).toBe(false);
    expect(failures).toEqual([]);
  });

  test("a stalled coverage read cannot withhold successful counts and is cancelled", async () => {
    let signal: AbortSignal | undefined;
    const failures: string[] = [];
    const handler = createOverviewHandler(
      {
        authorize: async () => {},
        read: async () => counts,
        readCoverage: async (query) => {
          signal = query.signal;
          return new Promise(() => {});
        },
        reportFailure: (part) => failures.push(part),
      },
      () => new Date("2026-10-25T03:00:00Z"),
      10,
    );
    const pending = handler(new Request("https://example.invalid"));
    const response = await Promise.race([
      pending,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
    ]);
    expect(response).not.toBeNull();
    expect(response?.status).toBe(200);
    expect(await response?.json()).toMatchObject({ counts, coverage: null });
    expect(signal?.aborted).toBe(true);
    expect(failures).toEqual(["coverage"]);
  });

  test("a stalled health read returns unknown without losing successful counts", async () => {
    let signal: AbortSignal | undefined;
    const handler = createOverviewHandler(
      {
        authorize: async () => {},
        read: async () => counts,
        readHealth: async (incoming) => {
          signal = incoming;
          return new Promise(() => {});
        },
      },
      () => new Date("2026-10-25T03:00:00Z"),
      10,
    );
    const response = await Promise.race([
      handler(new Request("https://example.invalid")),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 100)),
    ]);
    expect(response).not.toBeNull();
    expect(await response?.json()).toMatchObject({ counts, runtimeHealth: unknownHealth });
    expect(signal?.aborted).toBe(true);
  });

  test("a rejected health read stays unknown rather than failing available counts", async () => {
    const failures: string[] = [];
    const handler = createOverviewHandler({
      authorize: async () => {},
      read: async () => counts,
      readHealth: async () => {
        throw new Error("Synthetic upstream detail");
      },
      reportFailure: (part) => failures.push(part),
    });
    const response = await handler(new Request("https://example.invalid"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ counts, runtimeHealth: unknownHealth });
    expect(failures).toEqual(["health"]);
  });
});
