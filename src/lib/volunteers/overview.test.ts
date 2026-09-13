import { describe, expect, test } from "bun:test";
import { hongKongDayRange, createOverviewHandler } from "./overview";
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
