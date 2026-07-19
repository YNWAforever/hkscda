import { describe, expect, test } from "bun:test";

import { loadPublishedAnnualReports, loadPublishedDocumentSlots } from "./public.server";

describe("public document readers", () => {
  test("delegates annual reports and requested slots", async () => {
    const calls: unknown[] = [];
    const repository = {
      async listPublishedAnnualReports() {
        calls.push("reports");
        return [];
      },
      async listPublishedSlots(slotKeys: string[]) {
        calls.push(slotKeys);
        return [];
      },
    };

    await expect(loadPublishedAnnualReports(repository)).resolves.toEqual([]);
    await expect(
      loadPublishedDocumentSlots(["wedding_gift_return_plan"], repository),
    ).resolves.toEqual([]);
    expect(calls).toEqual(["reports", ["wedding_gift_return_plan"]]);
  });

  test("redacts annual-report provider errors", async () => {
    const repository = {
      async listPublishedAnnualReports() {
        throw new Error("relation annual_reports does not exist");
      },
      async listPublishedSlots() {
        return [];
      },
    };

    await expect(loadPublishedAnnualReports(repository)).rejects.toThrow(
      "Could not load annual reports",
    );
  });

  test("redacts document-slot provider errors", async () => {
    const repository = {
      async listPublishedAnnualReports() {
        return [];
      },
      async listPublishedSlots() {
        throw new Error("storage provider details");
      },
    };

    await expect(
      loadPublishedDocumentSlots(["wedding_gift_return_plan"], repository),
    ).rejects.toThrow("Could not load document slots");
  });
});
