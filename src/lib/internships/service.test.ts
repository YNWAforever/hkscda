import { describe, expect, spyOn, test } from "bun:test";

import { expectNoChineseText } from "../../components/admin/i18n/testing";
import { createInternshipHttp } from "./http.server";
import {
  adminCommandSchema,
  createInternshipService,
  intakeSchema,
  internshipErrorCode,
  internshipErrorText,
  type InternshipErrorCode,
} from "./service";

const ALL_CODES: InternshipErrorCode[] = [
  "name_required",
  "shelter_required",
  "closes_before_opens",
  "invalid_intake",
  "invalid_request",
  "forbidden",
  "state_conflict",
  "unexpected",
];

const intake = {
  enabled: true,
  name: "Vet student internship",
  shelters: ["cat"],
  opens_at: "2026-10-01T00:00:00+08:00",
  closes_at: "2026-12-31T23:59:00+08:00",
  instructions: "Bring your student card",
};

describe("intake settings checks", () => {
  test("a closing time before the opening time keeps its zh-HK message and carries a code", () => {
    const result = intakeSchema.safeParse({
      ...intake,
      opens_at: "2026-12-31T23:59:00+08:00",
      closes_at: "2026-10-01T00:00:00+08:00",
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.issues[0]?.message).toBe("截止時間必須晚於開放時間");
    expect(internshipErrorCode(result.error)).toBe("closes_before_opens");
  });

  test("a blank title and no shelter are told apart", () => {
    const blank = intakeSchema.safeParse({ ...intake, name: "   " });
    const none = intakeSchema.safeParse({ ...intake, shelters: [] });
    expect(!blank.success && internshipErrorCode(blank.error)).toBe("name_required");
    expect(!none.success && internshipErrorCode(none.error)).toBe("shelter_required");
  });

  test("any other failed check is a general intake error", () => {
    const tooLong = intakeSchema.safeParse({ ...intake, instructions: "x".repeat(3001) });
    expect(!tooLong.success && internshipErrorCode(tooLong.error)).toBe("invalid_intake");
  });

  test("a valid form passes", () => {
    expect(intakeSchema.safeParse(intake).success).toBe(true);
  });
});

describe("internshipErrorText", () => {
  test("defaults to zh-HK, word for word the text the API sends", () => {
    expect(internshipErrorText("invalid_request")).toBe("請檢查實習申請欄位");
    expect(internshipErrorText("forbidden")).toBe("沒有此操作權限");
    expect(internshipErrorText("state_conflict")).toBe("操作不符合目前申請狀態或核實要求");
    expect(internshipErrorText("unexpected")).toBe("未能處理，請重新整理後再試");
    expect(internshipErrorText("closes_before_opens", "zh")).toBe("截止時間必須晚於開放時間");
  });

  test("has an English message for each code, with no Chinese, that says what to do next", () => {
    for (const code of ALL_CODES) {
      const english = internshipErrorText(code, "en");
      expectNoChineseText(english);
      expect(english, code).toMatch(/(again|Refresh|Ask|Change|Enter|Choose|Check)/);
    }
  });
});

describe("internshipErrorCode", () => {
  test("finds the code of each message the API sends, and of nothing else", () => {
    for (const code of ["invalid_request", "forbidden", "state_conflict", "unexpected"] as const) {
      expect(internshipErrorCode(new Error(internshipErrorText(code)))).toBe(code);
    }
    expect(internshipErrorCode(new Error("API request failed"))).toBeNull();
    expect(internshipErrorCode(new Error("A message from some other server"))).toBeNull();
    expect(internshipErrorCode("沒有此操作權限")).toBeNull();
    expect(internshipErrorCode(null)).toBeNull();
  });
});

describe("the API keeps sending the zh-HK text", () => {
  // `internshipErrorCode` finds a code by the text the API sends. This drives the real handler,
  // so the table and the handler cannot drift apart.
  async function errorBodyFor(failure: unknown, body: object) {
    const service = createInternshipService({
      command: async () => {
        throw failure;
      },
    });
    const http = createInternshipHttp({ service, authenticate: async () => "admin-1" });
    const response = await http.post(
      new Request("http://localhost/api/admin/internships", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
      true,
    );
    return { status: response.status, error: (await response.json()).error as string };
  }

  test("each fixed message is the zh-HK text of its code", async () => {
    const logged = spyOn(console, "error").mockImplementation(() => undefined);
    try {
      const invalid = await errorBodyFor(new Error("unused"), { action: "not-an-action" });
      expect(invalid).toEqual({ status: 400, error: internshipErrorText("invalid_request") });
      const forbidden = await errorBodyFor({ code: "42501" }, { action: "settings" });
      expect(forbidden).toEqual({ status: 403, error: internshipErrorText("forbidden") });
      const conflict = await errorBodyFor({ code: "22023" }, { action: "settings" });
      expect(conflict).toEqual({ status: 422, error: internshipErrorText("state_conflict") });
      const unexpected = await errorBodyFor(new Error("boom"), { action: "settings" });
      expect(unexpected).toEqual({ status: 500, error: internshipErrorText("unexpected") });
    } finally {
      logged.mockRestore();
    }
  });

  test("the admin command schema still refuses a closing time before the opening time", () => {
    const result = adminCommandSchema.safeParse({
      action: "save_intake",
      expected_revision: 1,
      body: { ...intake, opens_at: intake.closes_at, closes_at: intake.opens_at },
    });
    expect(result.success).toBe(false);
  });
});
