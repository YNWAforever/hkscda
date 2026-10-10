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

const { renderAdminInChinese, renderAdminInEnglish } = await import("../i18n/testing");
const { ConfirmActionDialog } = await import("../ConfirmActionDialog");
const { INITIAL_CONFIRM_STATE, requiredReasonDialog, runConfirm } =
  await import("../confirmActionState");
const { voidReceiptRequest } = await import("./paymentsReconcileLogic");

/** What the page's onConfirm does with the dialog's reason. */
async function confirm(
  reason: string | null,
  mutate: (request: { receiptId: string; reason: string }) => Promise<unknown>,
) {
  const request = voidReceiptRequest({ id: "receipt-1" }, reason);
  if (request) await mutate(request);
}

const dialog = (
  <ConfirmActionDialog
    open
    onOpenChange={() => {}}
    title="Void receipt"
    consequence="Void receipt HKSCDA-2026-000001?"
    confirmLabel="Void receipt"
    reason={requiredReasonDialog}
    onConfirm={async () => {}}
  />
);

describe("the receipt void dialog asks for a reason", () => {
  test("it renders the reason field, labelled 原因 in Chinese and Reason in English", () => {
    const zh = renderAdminInChinese(dialog);
    expect(zh).toContain("<textarea");
    expect(zh).toContain("原因");
    const en = renderAdminInEnglish(dialog);
    expect(en).toContain("<textarea");
    expect(en).toContain("Reason");
  });

  // required-reason: receipt.void
  test("confirming sends the trimmed reason to the void mutation", async () => {
    const mutate = mock(async (_request: { receiptId: string; reason: string }) => undefined);
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: " wrong donor " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: (reason) => confirm(reason, mutate),
      onOpenChange: (open) => closed.push(open),
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ receiptId: "receipt-1", reason: "wrong donor" });
    expect(closed).toEqual([false]);
  });

  test("a rejecting mutation keeps the dialog open and the typed reason", async () => {
    const failure = new Error("boom");
    const actions: Array<{ type: string; error?: unknown }> = [];
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: "wrong donor" },
      inFlight: { current: false },
      dispatch: (action) => actions.push(action),
      onConfirm: (reason) =>
        confirm(reason, async () => {
          throw failure;
        }),
      onOpenChange: (open) => closed.push(open),
    });
    expect(closed).toEqual([]);
    expect(actions.at(-1)).toEqual({ type: "rejected", error: failure });
  });

  test("a blank reason never reaches the mutation", async () => {
    const mutate = mock(async () => undefined);
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: "   " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: (reason) => confirm(reason, mutate),
      onOpenChange: () => {},
    });
    expect(mutate).not.toHaveBeenCalled();
  });
});
