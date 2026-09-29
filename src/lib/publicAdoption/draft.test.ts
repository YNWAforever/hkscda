import { describe, expect, test } from "bun:test";

import {
  ADOPTION_DRAFT_STORAGE_KEY,
  pickAdoptionDraftData,
  parseDraft,
  serializeDraft,
} from "./draft";

describe("adoption draft storage", () => {
  test("uses a stable storage key", () => {
    expect(ADOPTION_DRAFT_STORAGE_KEY).toBe("hkscda-adoption-application-draft-v1");
  });

  test("retains the legacy parser only for the unchanged sponsorship wizard in this stacked PR", () => {
    expect(
      parseDraft(
        serializeDraft({ supporterName: "Ada", photos: [new File(["x"], "private.jpg")] }),
      ),
    ).toEqual({ supporterName: "Ada" });
  });

  test("persists only approved fields and excludes consent, photos, tokens, and documents", () => {
    expect(
      pickAdoptionDraftData({
        language: "en",
        contact: {
          applicantName: "Ada",
          email: "ada@example.com",
          otp: "123456",
          identityDocument: "private",
        },
        home: { housingType: "flat", accessToken: "secret" },
        readiness: { reason: "adopt", consent: true },
        visit: { notes: "weekends", proof: "secret" },
        terms: { agreed: true },
        photos: [{ name: "private.jpg" }],
        statusToken: "secret",
      }),
    ).toEqual({
      language: "en",
      contact: { applicantName: "Ada", email: "ada@example.com" },
      home: { housingType: "flat" },
      readiness: { reason: "adopt" },
      visit: { notes: "weekends" },
    });
  });
});
