import { expect, test } from "bun:test";
import { AdminApiError } from "../../../lib/admin/session";
import { contentCommonCopy } from "./contentCommonCopy";
import { contentLifecycleErrorMessage, isContentConflict } from "./contentErrors";

function apiError(status: number, code: string) {
  return new AdminApiError({ status, code, message: "Content lifecycle operation failed" });
}

const reasons = [
  [422, "media_cover_internal"],
  [422, "session_expired"],
  [422, "media_mismatch"],
  [422, "link_exists"],
  [422, "primary_subject_exists"],
  [409, "slug_taken"],
] as const;

test("BUG-69: each lifecycle reason has its own message in both languages", () => {
  for (const language of ["zh", "en"] as const) {
    const generic = new Set([
      contentLifecycleErrorMessage(apiError(409, "conflict"), language),
      contentLifecycleErrorMessage(apiError(422, "invalid"), language),
      contentLifecycleErrorMessage(apiError(500, "internal"), language),
    ]);
    const seen = new Set<string>();
    for (const [status, code] of reasons) {
      const message = contentLifecycleErrorMessage(apiError(status, code), language);
      expect(message).toBe(contentCommonCopy[language].lifecycleErrors[code]);
      expect(generic.has(message)).toBe(false);
      expect(seen.has(message ?? "")).toBe(false);
      seen.add(message ?? "");
    }
  }
});

test("BUG-69: an internal update's cover and an expired session no longer read as a field error", () => {
  expect(contentLifecycleErrorMessage(apiError(422, "media_cover_internal"), "en")).toContain(
    "internal update",
  );
  expect(contentLifecycleErrorMessage(apiError(422, "session_expired"), "en")).toContain("expired");
  expect(contentLifecycleErrorMessage(apiError(422, "media_cover_internal"), "en")).not.toContain(
    "URL slug",
  );
});

test("BUG-69: the conflict message does not tell the admin to save again after a reload", () => {
  expect(contentCommonCopy.en.lifecycleErrors.conflict).not.toContain("reload, then save again");
  expect(contentCommonCopy.zh.lifecycleErrors.conflict).not.toContain("重新載入頁面後再儲存");
});

test("BUG-69: the unused lifecycle entries are gone", () => {
  expect(Object.keys(contentCommonCopy.en.lifecycleErrors)).not.toContain("unverifiedPublish");
  expect(Object.keys(contentCommonCopy.en.lifecycleErrors)).not.toContain("detail");
});

test("BUG-69: a duplicate link is never a stale-version conflict", () => {
  expect(isContentConflict(apiError(422, "link_exists"))).toBe(false);
  // Even answered with a 409, the reason says it is not about the version.
  expect(isContentConflict(apiError(409, "link_exists"))).toBe(false);
  expect(isContentConflict(apiError(409, "primary_subject_exists"))).toBe(false);
  expect(isContentConflict(apiError(409, "conflict"))).toBe(true);
  expect(isContentConflict(Object.assign(new Error("Stale"), { status: 409 }))).toBe(true);
  expect(isContentConflict(apiError(422, "invalid"))).toBe(false);
  expect(isContentConflict(null)).toBe(false);
});
