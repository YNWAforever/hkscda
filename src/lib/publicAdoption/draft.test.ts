import { describe, expect, test } from "bun:test";

import { ADOPTION_DRAFT_STORAGE_KEY, parseDraft, serializeDraft } from "./draft";

describe("adoption draft storage", () => {
  test("uses a stable storage key", () => {
    expect(ADOPTION_DRAFT_STORAGE_KEY).toBe("hkscda-adoption-application-draft-v1");
  });

  test("round-trips non-file fields", () => {
    const draft = {
      language: "en",
      contact: { applicantName: "Ada", email: "ada@example.com" },
      photos: [{ name: "must-not-persist.jpg" }],
    };
    const parsed = parseDraft(serializeDraft(draft));
    expect(parsed).toEqual({
      language: "en",
      contact: { applicantName: "Ada", email: "ada@example.com" },
    });
  });

  test("returns an empty object for corrupt JSON", () => {
    expect(parseDraft("{broken")).toEqual({});
  });
});
