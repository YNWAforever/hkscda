import { describe, expect, mock, test } from "bun:test";

const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return { ok: true };
  },
  getAdminAccessToken: async () => "token",
}));

const { INITIAL_CONFIRM_STATE, requiredReasonDialog, runConfirm } =
  await import("../confirmActionState");
const { estateDeleteRequest, sendEstateDelete } = await import("./estateDelete");

const ESTATE = "22222222-2222-4222-8222-222222222222";

describe("deleting an estate asks for a reason", () => {
  test("the screen's dialog asks for a reason and the delete button only opens it", async () => {
    const source = await Bun.file(
      "src/components/admin/content/AdoptionInformationManagement.tsx",
    ).text();
    const from = source.indexOf("open={deleteEstateId !== null}");
    const dialog = source.slice(from, source.indexOf("/>", from));
    expect(dialog).toContain("reason={requiredReasonDialog}");
    expect(dialog).not.toContain('reason="none"');
    expect(source).toContain("onDeleteEstate={setDeleteEstateId}");
  });

  // required-reason: estate.delete
  test("confirming sends the id with the trimmed reason", async () => {
    const mutate = mock(async (_request: { id: string; reason: string }) => undefined);
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: " listed in error " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: async (reason) => {
        const request = estateDeleteRequest(ESTATE, reason);
        if (request) await mutate(request);
      },
      onOpenChange: (open) => closed.push(open),
    });
    expect(mutate.mock.calls[0][0]).toEqual({ id: ESTATE, reason: "listed in error" });
    expect(closed).toEqual([false]);
  });

  // required-reason: estate.delete
  test("the DELETE request body carries the id and the reason", async () => {
    fetchCalls.length = 0;
    const request = estateDeleteRequest(ESTATE, " listed in error ");
    expect(request).not.toBeNull();
    await sendEstateDelete(request!, "zh");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("/api/admin/adoption-information");
    expect(fetchCalls[0].init?.method).toBe("DELETE");
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      id: ESTATE,
      reason: "listed in error",
    });
  });

  test("a blank reason, or no chosen estate, never builds a request", () => {
    expect(estateDeleteRequest(ESTATE, "   ")).toBeNull();
    expect(estateDeleteRequest(ESTATE, null)).toBeNull();
    expect(estateDeleteRequest(null, "x")).toBeNull();
  });
});
