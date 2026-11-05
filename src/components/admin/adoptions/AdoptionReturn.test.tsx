import { describe, expect, mock, test } from "bun:test";

const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
mock.module("./api", () => ({
  fetchCoordinatorJson: async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return { adoption: { id: "a", returnedAt: "2026-11-01T00:00:00.000Z" } };
  },
}));

const { adoptionReturnRequest, canRecordAdoptionReturn, sendAdoptionReturn } =
  await import("./adoptionReturn");
const { finalizationCopy } = await import("./copy");

const ADOPTION = "abababab-cdcd-4333-8444-555555555555";
const SOURCE = "src/components/admin/adoptions/FinalizationPanel.tsx";

describe("BUG-33: recording an adoption return", () => {
  // required-reason: successful_adoption.return
  test("BUG-33: the request carries the trimmed reason; a blank reason builds nothing", () => {
    expect(adoptionReturnRequest({ successfulAdoptionId: ADOPTION, reason: "  allergy " })).toEqual(
      { successfulAdoptionId: ADOPTION, body: { reason: "allergy" } },
    );
    for (const reason of ["", "   ", null]) {
      expect(adoptionReturnRequest({ successfulAdoptionId: ADOPTION, reason })).toBeNull();
    }
  });

  // required-reason: successful_adoption.return
  test("BUG-33: the POST goes to the return route with the reason", async () => {
    fetchCalls.length = 0;
    const request = adoptionReturnRequest({ successfulAdoptionId: ADOPTION, reason: "allergy" });
    await sendAdoptionReturn(request!);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`/api/admin/adoptions/successful-adoptions/${ADOPTION}/return`);
    expect(fetchCalls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({ reason: "allergy" });
  });

  test("BUG-33: only an unreturned adoption offers the action", () => {
    expect(canRecordAdoptionReturn(null)).toBe(false);
    expect(canRecordAdoptionReturn({ returnedAt: null })).toBe(true);
    expect(canRecordAdoptionReturn({ returnedAt: "2026-11-01T00:00:00.000Z" })).toBe(false);
  });

  test("BUG-33: the panel asks for the reason in a dialog and shows a recorded return", async () => {
    const source = await Bun.file(SOURCE).text();
    expect(source).toContain("required-reason: successful_adoption.return");
    const from = source.indexOf("open={returnOpen}");
    expect(from).toBeGreaterThan(0);
    const dialog = source.slice(from, source.indexOf("/>", from));
    expect(dialog).toContain("reason={requiredReasonDialog}");
    expect(dialog).toContain("await returnMutation.mutateAsync(request)");
    expect(source).toContain("canRecordAdoptionReturn(successfulAdoption)");
    expect(source).toContain("successfulAdoption.returnReason");
    expect(source).toContain("format.date(successfulAdoption.returnedAt)");
  });

  test("BUG-33: the copy is bilingual and uses the glossary term", () => {
    expect(finalizationCopy.zh.recordReturn).toBe("記錄退回");
    expect(finalizationCopy.en.recordReturn).toBe("Record return");
    expect(finalizationCopy.zh.returnConsequence).not.toBe("");
    expect(finalizationCopy.en.returnConsequence).toContain("available");
    expect(finalizationCopy.en.returned).toBe("Returned");
  });
});
