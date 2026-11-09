import { describe, expect, test } from "bun:test";

import { AdminApiError, AdminSessionError } from "../../../lib/admin/session";
import { expectNoChineseText } from "../i18n/testing";
import { contentApiErrorLines, contentFieldErrorLines, editorFieldLabels } from "./contentApiErrors";
import { contentApiErrorsCopy } from "./contentApiErrorsCopy";
import { contentLifecycleErrorMessage } from "./contentErrors";

describe("contentApiErrorLines", () => {
  const notPublished = new AdminApiError({
    status: 409,
    code: "not_published",
    message: "Publish the story before generating outbound copy",
  });

  test("BUG-66: explains an unpublished story in the admin's language", () => {
    expect(contentApiErrorLines(notPublished)).toEqual([contentApiErrorsCopy.zh.notPublished]);
    const english = contentApiErrorLines(notPublished, "en");
    expect(english).toEqual([contentApiErrorsCopy.en.notPublished]);
    expectNoChineseText(english?.join("\n") ?? "");
    expect(english?.join("\n")).not.toContain("generating outbound copy");
  });

  test("leaves any other error to the caller", () => {
    expect(
      contentApiErrorLines(new AdminApiError({ status: 409, code: "conflict", message: "x" })),
    ).toBeNull();
    expect(contentApiErrorLines(new AdminSessionError("not_signed_in"))).toBeNull();
    expect(contentApiErrorLines(new Error("boom"))).toBeNull();
    expect(contentApiErrorLines(null)).toBeNull();
  });

  // What withContentErrors sends for the editor's "Lucky Story" slug, a 181-character title and a
  // CTA URL of "www.hkscda.org", as zod words it.
  const invalid = new AdminApiError({
    status: 400,
    code: "invalid",
    message: "Invalid content management request",
    fields: {
      slug: ["Invalid"],
      title: ["String must contain at most 180 character(s)"],
      ctaUrl: ["CTA URL must be an http(s) URL or a root-relative path"],
      summary: ["Required"],
      expectedVersion: ["Expected number, received string"],
    },
  });

  test("BUG-68: names each field by its editor label with the reason in Chinese", () => {
    expect(contentApiErrorLines(invalid)).toEqual([
      "以下欄位需要修改：",
      "Slug：只可使用小寫英文字母、數字及連字號，並以連字號分隔。",
      "標題：不可超過 180 個字元。",
      "CTA 連結：請填寫 http(s) 網址，或以 / 開頭的站內路徑。",
      "摘要：必須填寫。",
      "expectedVersion：內容不正確。",
    ]);
  });

  test("BUG-68: names each field by its editor label with the reason in English", () => {
    const english = contentApiErrorLines(invalid, "en");
    expect(english).toEqual([
      "Fix these fields:",
      "Slug: Use lowercase letters and numbers, separated by single hyphens.",
      "Title: Must be 180 characters or fewer.",
      "CTA link: Enter an http(s) URL or a site path starting with /.",
      "Summary: Required.",
      "expectedVersion: Expected number, received string",
    ]);
    expectNoChineseText(english?.join("\n") ?? "");
  });

  test("BUG-68: a reason the server wrote in Chinese is kept in Chinese, labelled", () => {
    const lines = contentFieldErrorLines({ slug: ["此網址格式不正確"] }, "zh", { slug: "網址" });
    expect(lines).toEqual(["網址：此網址格式不正確"]);
  });

  test("BUG-68: an invalid error without fields is left to the lifecycle text", () => {
    expect(
      contentApiErrorLines(new AdminApiError({ status: 422, code: "invalid", message: "x" })),
    ).toBeNull();
  });
});

describe("CMS-03: publication-metadata refusals name the field in the admin's language", () => {
  const metadataError = new AdminApiError({
    status: 400,
    code: "invalid",
    message: "Invalid publication metadata",
    fields: {
      sourceReference: ["Required"],
      contentOwner: ["Required"],
      effectiveUntil: ["Effective until must be after effective from"],
    },
  });

  test("CMS-03: the three fields are labelled by the publication-metadata panel and the reasons are Chinese", () => {
    expect(contentApiErrorLines(metadataError)).toEqual([
      "以下欄位需要修改：",
      "資料來源／批准記錄：必須填寫。",
      "內容負責人：必須填寫。",
      "結束時間：結束時間必須遲於生效時間。",
    ]);
  });

  test("CMS-03: the English screen gets the same lines with no server English leaked", () => {
    const english = contentApiErrorLines(metadataError, "en");
    expect(english).toEqual([
      "Fix these fields:",
      "Data source / approval record: Required.",
      "Content owner: Required.",
      "Effective until: The end time must be after the start time.",
    ]);
    expectNoChineseText(english?.join("\n") ?? "");
  });

  test("CMS-03: every metadata field has an editor label", () => {
    const labels = editorFieldLabels("zh");
    for (const key of [
      "contentClass",
      "sourceReference",
      "contentOwner",
      "effectiveFrom",
      "effectiveUntil",
    ]) {
      expect(labels[key]?.length ?? 0).toBeGreaterThan(0);
    }
  });

  test("CMS-03: the version conflict is left to the lifecycle copy, which is Chinese", () => {
    const conflict = new AdminApiError({
      status: 409,
      code: "conflict",
      message: "Content changed; reload before saving",
    });
    expect(contentApiErrorLines(conflict)).toBeNull();
    expect(contentLifecycleErrorMessage(conflict)).toContain("儲存衝突");
    expect(contentLifecycleErrorMessage(conflict)).not.toContain("Content changed");
    expectNoChineseText(contentLifecycleErrorMessage(conflict, "en") ?? "");
    expect(contentLifecycleErrorMessage(conflict, "en")).toContain("Save conflict");
  });
});
