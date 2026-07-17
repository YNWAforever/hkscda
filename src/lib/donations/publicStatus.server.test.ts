import { describe, expect, test } from "bun:test";

import { loadPublicDonationStatus } from "./publicStatus.server";

describe("public donation status", () => {
  test("returns only payment state", async () => {
    const result = await loadPublicDonationStatus({
      donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      repository: { findStatus: async () => "succeeded" },
    });

    expect(result).toEqual({ status: "succeeded" });
  });

  test("hides invalid and missing donations", async () => {
    expect(
      await loadPublicDonationStatus({
        donationId: "invalid",
        repository: { findStatus: async () => "succeeded" },
      }),
    ).toBeNull();
    expect(
      await loadPublicDonationStatus({
        donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
        repository: { findStatus: async () => null },
      }),
    ).toBeNull();
  });
});
