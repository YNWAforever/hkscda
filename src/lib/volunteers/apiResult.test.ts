import { describe, expect, test } from "bun:test";
import { normalizeVolunteerResult, volunteerErrorMessage } from "./apiResult";
describe("volunteer action errors", () => {
  test("policy invalid/conflict results have useful client error without changing their issues", () => {
    const issues = [{ path: "capacity.volunteers", message: "Required" }];
    const invalid = normalizeVolunteerResult({ kind: "invalid", issues });
    expect(invalid.status).toBe(422);
    expect(invalid.body).toMatchObject({
      issues,
      error: expect.stringContaining("設定欄位"),
      retryable: false,
    });
    expect(normalizeVolunteerResult({ kind: "conflict", reason: "stale_preview" })).toMatchObject({
      status: 409,
      body: { error: expect.stringContaining("重新預覽") },
    });
  });
  test("maps actual booking reasons and never leaks unknown database messages", () => {
    for (const reason of [
      "overlapping_duty",
      "not_open",
      "registration_closed",
      "cancellation_closed",
      "waitlist_full",
      "terms_required",
    ])
      expect(volunteerErrorMessage({ reason }, 422)).not.toContain(reason);
    const raw = "connection failed postgres://user:secret@private";
    expect(volunteerErrorMessage({ error: raw }, 500)).not.toContain("secret");
    expect(normalizeVolunteerResult({}, 503)).toMatchObject({ body: { retryable: true } });
  });
  test("preserves successful preview/list shapes including preview issues", () => {
    const preview = { preview_id: "synthetic", issues: [{ message: "needs review" }] };
    expect(normalizeVolunteerResult(preview)).toEqual({ body: preview, status: 200 });
  });
  test("authorization failures use an explicit next step", () => {
    expect(volunteerErrorMessage({}, 401)).toContain("重新登入");
    expect(volunteerErrorMessage({}, 403)).toContain("管理員");
  });
});
