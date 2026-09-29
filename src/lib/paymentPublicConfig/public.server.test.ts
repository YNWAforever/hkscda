import { describe, expect, mock, test } from "bun:test";

import { loadPublicPaymentMethods } from "./public.server";

function fakeClient(data: unknown[], error: unknown = null) {
  const builder: Record<string, unknown> = {
    order: () => Promise.resolve({ data, error }),
  };
  const eq = mock(() => builder);
  builder.eq = eq;
  const client = {
    from: () => ({
      select: () => builder,
    }),
  } as never;
  return { client, eq };
}

describe("loadPublicPaymentMethods", () => {
  test("maps published, publicly-visible rows in sort order", async () => {
    const { client } = fakeClient([
      { method: "stripe", display_label_zh: "信用卡", display_label_en: "Card", details: {} },
      {
        method: "fps",
        display_label_zh: "轉數快 FPS",
        display_label_en: "FPS",
        details: { payableTo: "Synthetic charity", identifier: "FPS TEST-123" },
      },
    ]);
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual({
      state: "ready",
      methods: [
        { method: "stripe", displayLabelZh: "信用卡", displayLabelEn: "Card", details: {} },
        {
          method: "fps",
          displayLabelZh: "轉數快 FPS",
          displayLabelEn: "FPS",
          details: { payableTo: "Synthetic charity", identifier: "FPS TEST-123" },
        },
      ],
    });
  });

  test("reports a true empty configuration separately", async () => {
    const { client } = fakeClient([]);
    expect(await loadPublicPaymentMethods(client)).toEqual({
      state: "not_configured",
      methods: [],
    });
  });

  test("filters on published state and public visibility via eq()", async () => {
    const { client, eq } = fakeClient([]);
    await loadPublicPaymentMethods(client);
    expect(eq).toHaveBeenCalledWith("state", "published");
    expect(eq).toHaveBeenCalledWith("is_publicly_visible", true);
  });

  test("reports unavailable when the query errors", async () => {
    const { client } = fakeClient([], { message: "connection refused" });
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual({ state: "unavailable", methods: [] });
  });

  test("reports unavailable for a published manual method without payment details", async () => {
    const { client } = fakeClient([
      { method: "fps", display_label_zh: "轉數快", display_label_en: "FPS", details: {} },
    ]);
    expect(await loadPublicPaymentMethods(client)).toEqual({ state: "unavailable", methods: [] });
  });

  test("reports unavailable for a malformed published row", async () => {
    const { client } = fakeClient([
      { method: "not_a_real_method", display_label_zh: "x", display_label_en: "y", details: {} },
    ]);
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual({ state: "unavailable", methods: [] });
  });
});
