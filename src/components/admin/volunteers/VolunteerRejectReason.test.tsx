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
const { rejectionRequest } = await import("./volunteerAdminLogic");

type Request = { status: string; reason?: string };

/** What each page's onConfirm does with the dialog's reason: send `{ status: "rejected", reason }`. */
async function confirm(reason: string | null, mutate: (request: Request) => Promise<unknown>) {
  const request = rejectionRequest("rejected", reason);
  if (request) await mutate(request);
}

const dialog = (
  <ConfirmActionDialog
    open
    onOpenChange={() => {}}
    title="Reject"
    consequence="Reject the registration of Ada?"
    confirmLabel="Reject"
    reason={requiredReasonDialog}
    onConfirm={async () => {}}
  />
);

describe("the volunteer registration reject dialog asks for a reason", () => {
  test("it renders the reason field, labelled 原因 in Chinese and Reason in English", () => {
    const zh = renderAdminInChinese(dialog);
    expect(zh).toContain("<textarea");
    expect(zh).toContain("原因");
    const en = renderAdminInEnglish(dialog);
    expect(en).toContain("<textarea");
    expect(en).toContain("Reason");
  });

  // required-reason: volunteer_registration.reject
  test("confirming sends the rejected status with the trimmed reason", async () => {
    const mutate = mock(async (_request: Request) => undefined);
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: " no-show history " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: (reason) => confirm(reason, mutate),
      onOpenChange: (open) => closed.push(open),
    });
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0][0]).toEqual({ status: "rejected", reason: "no-show history" });
    expect(closed).toEqual([false]);
  });

  test("a rejecting mutation keeps the dialog open and the typed reason", async () => {
    const failure = new Error("boom");
    const actions: Array<{ type: string; error?: unknown }> = [];
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: "no-show history" },
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

  test("no rejection is built when no registration is chosen", () => {
    expect(rejectionRequest(null, "x")).toBeNull();
  });
});
