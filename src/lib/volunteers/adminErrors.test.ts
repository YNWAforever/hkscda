import { describe, expect, mock, test } from "bun:test";

import { expectNoChineseText } from "../../components/admin/i18n/testing";

mock.module("../supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
}));

const { AdminApiError, AdminSessionError } = await import("../admin/session");
const { volunteerAdminErrorMessage } = await import("./adminErrors");
const { BulkInputError } = await import("./bulk/service");
const { VolunteerSelectionError } = await import("./directory/reviewerBulkSelection");
const { volunteerCodeMessage } = await import("./apiResult");

describe("the error text of the volunteer admin screens", () => {
  test("shows a session error, a coded error and a plain message in the screen's language", () => {
    expect(volunteerAdminErrorMessage(new AdminSessionError("not_signed_in"), "en")).toBe(
      "Not signed in. Sign in again.",
    );
    expect(volunteerAdminErrorMessage(new AdminSessionError("not_signed_in"))).toBe("未登入");
    expect(volunteerAdminErrorMessage(new BulkInputError("invalid_date"), "en")).toContain(
      "valid date",
    );
    expect(volunteerAdminErrorMessage(new BulkInputError("invalid_date"))).toBe("日期無效");
    expect(volunteerAdminErrorMessage(new VolunteerSelectionError("too_many"), "en")).toContain(
      "at most 1,000",
    );
    expect(volunteerAdminErrorMessage(new VolunteerSelectionError("too_many"))).toBe(
      "最多只能選取 1000 筆義工身份",
    );
    // An English message from the server is shown as it came; a value that is not an error has none.
    expect(volunteerAdminErrorMessage(new Error("Capacity conflict"), "en")).toBe(
      "Capacity conflict",
    );
    expect(volunteerAdminErrorMessage("text", "en")).toBeNull();
    expect(volunteerAdminErrorMessage(undefined)).toBeNull();
  });

  test("Chinese keeps the message the API sent", () => {
    const error = new AdminApiError({
      status: 409,
      message: "資料已被更新，請重新整理及預覽後再試。",
    });
    expect(volunteerAdminErrorMessage(error)).toBe(error.message);
    expect(volunteerAdminErrorMessage(error, "zh")).toBe(error.message);
    expect(volunteerAdminErrorMessage(new Error("任何訊息"), "zh")).toBe("任何訊息");
  });

  test("English finds the text of a known message, and otherwise the message for the HTTP status", () => {
    const known = new AdminApiError({
      status: 409,
      message: "資料已被更新，請重新整理及預覽後再試。",
    });
    expect(volunteerAdminErrorMessage(known, "en")).toBe(volunteerCodeMessage("conflict", "en"));
    const serverText = new AdminApiError({ status: 500, message: "未能載入義工資料，請重試" });
    expect(volunteerAdminErrorMessage(serverText, "en")).toBe(
      "Could not load volunteer details. Try again.",
    );
    const unknown = new AdminApiError({ status: 403, message: "一段沒有人見過的訊息" });
    const fallback = volunteerAdminErrorMessage(unknown, "en") ?? "";
    expectNoChineseText(fallback);
    expect(fallback).toBe(volunteerCodeMessage("forbidden", "en") ?? "");
    // An error that is not an API error still never shows Chinese in English.
    const plain = volunteerAdminErrorMessage(new Error("一段沒有人見過的訊息"), "en") ?? "";
    expectNoChineseText(plain);
    expect(plain).toBe(volunteerCodeMessage("unavailable", "en") ?? "");
  });
});
