import { describe, expect, test } from "bun:test";

import { publicationCommandFailure } from "./publicationCommandFailure";

describe("animal publication command failures", () => {
  test("CMS-01: a stale save answers 409 with a stale_draft error code", () => {
    const failure = publicationCommandFailure("save", { kind: "conflict" });

    expect(failure?.status).toBe(409);
    expect(failure?.body).toEqual({
      error: {
        code: "stale_draft",
        message: "草稿已在其他地方更新，已重新載入；你的修改仍然保留，請再次儲存。",
      },
    });
  });

  test("a saved draft is not a failure", () => {
    expect(publicationCommandFailure("save", { kind: "saved", revision: 8 })).toBeNull();
    expect(publicationCommandFailure("save", { revision: 8 })).toBeNull();
  });

  test("publish keeps its stale_preview translation and its 409/404 statuses", () => {
    expect(publicationCommandFailure("publish", { kind: "conflict" })).toEqual({
      status: 409,
      body: { error: { code: "stale_preview", message: "草稿已變更，請重新預覽。" } },
    });
    expect(publicationCommandFailure("publish", { kind: "not_found" })?.status).toBe(404);
  });

  test("other commands and unknown results keep the route's generic tail", () => {
    // The copy/restore command still reports a conflict through the HTTP status, as before.
    expect(publicationCommandFailure("copy", { kind: "conflict" })).toBeNull();
    expect(publicationCommandFailure("read", { kind: "conflict" })).toBeNull();
    expect(publicationCommandFailure("save", null)).toBeNull();
    expect(publicationCommandFailure(undefined, { kind: "conflict" })).toBeNull();
  });
});
