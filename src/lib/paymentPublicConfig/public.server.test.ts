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
      { method: "fps", display_label_zh: "轉數快 FPS", display_label_en: "FPS", details: {} },
    ]);
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual([
      { method: "stripe", displayLabelZh: "信用卡", displayLabelEn: "Card", details: {} },
      { method: "fps", displayLabelZh: "轉數快 FPS", displayLabelEn: "FPS", details: {} },
    ]);
  });

  test("filters on published state and public visibility via eq()", async () => {
    const { client, eq } = fakeClient([]);
    await loadPublicPaymentMethods(client);
    expect(eq).toHaveBeenCalledWith("state", "published");
    expect(eq).toHaveBeenCalledWith("is_publicly_visible", true);
  });

  test("returns an empty array when the query errors, instead of throwing", async () => {
    const { client } = fakeClient([], { message: "connection refused" });
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual([]);
  });

  test("skips a row that fails to parse instead of throwing", async () => {
    const { client } = fakeClient([
      { method: "not_a_real_method", display_label_zh: "x", display_label_en: "y", details: {} },
    ]);
    const result = await loadPublicPaymentMethods(client);
    expect(result).toEqual([]);
  });
});
