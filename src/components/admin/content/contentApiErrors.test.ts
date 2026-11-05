import { describe, expect, test } from "bun:test";

import { AdminApiError, AdminSessionError } from "../../../lib/admin/session";
import { expectNoChineseText } from "../i18n/testing";
import { contentApiErrorLines } from "./contentApiErrors";
import { contentApiErrorsCopy } from "./contentApiErrorsCopy";

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
});
