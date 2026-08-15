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

  test("refreshes pending COD only after UUID validation and before reading status", async () => {
    const calls: string[] = [];
    const repository = {
      refreshPendingCod: async () => {
        calls.push("refresh");
      },
      findStatus: async () => {
        calls.push("find");
        return "succeeded" as const;
      },
    };

    await loadPublicDonationStatus({
      donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      repository,
    });
    expect(calls).toEqual(["refresh", "find"]);

    calls.length = 0;
    await loadPublicDonationStatus({ donationId: "invalid", repository });
    expect(calls).toEqual([]);
  });

  test("continues with the local status when COD refresh is unavailable", async () => {
    const result = await loadPublicDonationStatus({
      donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      repository: {
        refreshPendingCod: async () => {
          throw new Error("COD unavailable");
        },
        findStatus: async () => "pending",
      },
    });

    expect(result).toEqual({ status: "pending" });
  });

  test("does not expose succeeded while COD side-effect recovery is failing", async () => {
    const result = await loadPublicDonationStatus({
      donationId: "f8dce8fa-83f4-4d5f-b0b0-fbc3348efb7a",
      repository: {
        refreshPendingCod: async () => {
          throw new Error("acknowledgement retry failed");
        },
        findStatus: async () => "succeeded",
      },
    });

    expect(result).toEqual({ status: "pending" });
  });
});
