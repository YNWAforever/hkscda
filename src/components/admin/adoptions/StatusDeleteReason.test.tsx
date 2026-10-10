import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module("../../ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div data-dialog>{children}</div> : null,
  AlertDialogContent: passthrough,
  AlertDialogHeader: passthrough,
  AlertDialogFooter: passthrough,
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({ children }: { children?: ReactNode }) => <button>{children}</button>,
}));

const fetchCalls: Array<{ url: string; init: RequestInit | undefined }> = [];
mock.module("./api", () => ({
  fetchCoordinatorJson: async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return { ok: true };
  },
}));

const { renderAdminInChinese, renderAdminInEnglish } = await import("../i18n/testing");
const { ConfirmActionDialog } = await import("../ConfirmActionDialog");
const { INITIAL_CONFIRM_STATE, requiredReasonDialog, runConfirm } =
  await import("../confirmActionState");
const { adminCommonCopy } = await import("../i18n/adminCommonCopy");
const { coordinatorPageCopy } = await import("../pageCopy/coordinatorCopy");
const { sendStatusDelete, statusDeleteRequest } = await import("./statusDelete");

const STATUS = "33333333-4444-4333-8444-555555555555";

describe("deleting a coordinator status asks for a reason", () => {
  test("the screen's dialog asks for a reason and the delete button only opens it", async () => {
    const source = await Bun.file("src/components/admin/adoptions/StatusAdmin.tsx").text();
    const from = source.indexOf("open={deleteTarget !== null}");
    const dialog = source.slice(from, source.indexOf("/>", from));
    expect(dialog).toContain("reason={requiredReasonDialog}");
    expect(dialog).not.toContain('reason="none"');
    expect(source).toContain("await deleteMutation.mutateAsync(");
    expect(source).toContain("setDeleteTarget(status)");
  });

  test("the dialog shows a reason field in Chinese and in English", () => {
    const dialog = (language: "zh" | "en") => (
      <ConfirmActionDialog
        open
        onOpenChange={() => {}}
        title={adminCommonCopy[language].common.delete}
        consequence={coordinatorPageCopy[language].statuses.deleteConfirm("跟進中", "Following")}
        confirmLabel={adminCommonCopy[language].common.delete}
        destructive
        reason={requiredReasonDialog}
        onConfirm={async () => {}}
      />
    );
    const zh = renderAdminInChinese(dialog("zh"));
    expect(zh).toContain("<textarea");
    expect(zh).toContain("原因");
    expect(zh).toContain("刪除 跟進中 / Following？");
    const en = renderAdminInEnglish(dialog("en"));
    expect(en).toContain("<textarea");
    expect(en).toContain("Reason");
    expect(en).toContain("Delete Following?");
  });

  // required-reason: coordinator_status.delete
  test("confirming sends the id with the trimmed reason", async () => {
    const mutate = mock(async (_request: { id: string; reason: string }) => undefined);
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: " merged into another status " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: async (reason) => {
        const request = statusDeleteRequest(STATUS, reason);
        if (request) await mutate(request);
      },
      onOpenChange: (open) => closed.push(open),
    });
    expect(mutate.mock.calls[0][0]).toEqual({ id: STATUS, reason: "merged into another status" });
    expect(closed).toEqual([false]);
  });

  // required-reason: coordinator_status.delete
  test("the DELETE request body carries the reason", async () => {
    fetchCalls.length = 0;
    const request = statusDeleteRequest(STATUS, " merged into another status ");
    expect(request).not.toBeNull();
    await sendStatusDelete(request!, "zh");
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`/api/admin/adoptions/statuses/${STATUS}`);
    expect(fetchCalls[0].init?.method).toBe("DELETE");
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      reason: "merged into another status",
    });
  });

  test("a blank reason, or no chosen status, never builds a request", () => {
    expect(statusDeleteRequest(STATUS, "   ")).toBeNull();
    expect(statusDeleteRequest(STATUS, null)).toBeNull();
    expect(statusDeleteRequest(null, "x")).toBeNull();
  });
});
