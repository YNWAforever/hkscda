import { describe, expect, test } from "bun:test";
import { hongKongDayRange, createOverviewHandler } from "./overview";
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
