import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

import { AdminSessionError } from "../../lib/admin/session";

/**
 * Radix renders the dialog into a portal, which does not exist on the server, so the
 * primitives are replaced by plain elements that keep their children. The dialog's own
 * logic (what it shows and when) is the real one.
 */
const passthrough = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
mock.module("../ui/alert-dialog", () => ({
  AlertDialog: ({ open, children }: { open: boolean; children?: ReactNode }) =>
    open ? <div data-dialog>{children}</div> : null,
  AlertDialogContent: passthrough,
  AlertDialogHeader: passthrough,
  AlertDialogFooter: passthrough,
  AlertDialogTitle: ({ children }: { children?: ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children?: ReactNode }) => <p>{children}</p>,
  AlertDialogCancel: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
    <button data-cancel disabled={disabled}>
      {children}
    </button>
  ),
  AlertDialogAction: ({ children, disabled }: { children?: ReactNode; disabled?: boolean }) => (
    <button data-action disabled={disabled}>
      {children}
    </button>
  ),
}));

const { renderAdminInChinese, renderAdminInEnglish, expectNoChineseText } =
  await import("./i18n/testing");
const { ConfirmActionDialog } = await import("./ConfirmActionDialog");
const {
  CONFIRM_REASON_MAX_LENGTH,
  INITIAL_CONFIRM_STATE,
  canConfirm,
  confirmDialogReducer,
  runConfirm,
} = await import("./confirmActionState");
const { confirmActionCopy } = await import("./confirmActionCopy");

const base = {
  open: true,
  onOpenChange: () => {},
  title: "Title here",
  consequence: "Consequence here",
  confirmLabel: "Verb here",
  onConfirm: async () => {},
};

describe("canConfirm", () => {
  test("a dialog without a reason can always confirm, unless a request is running", () => {
    expect(canConfirm("none", "", false)).toBe(true);
    expect(canConfirm("none", "", true)).toBe(false);
  });

  test("a required reason counts its trimmed length", () => {
    const reason = { required: true, minLength: 5 } as const;
    expect(canConfirm(reason, "  abcd ", false)).toBe(false);
    expect(canConfirm(reason, "abcde", false)).toBe(true);
    expect(canConfirm(reason, "  abcde ", false)).toBe(true);
  });

  test("nothing confirms while pending", () => {
    expect(canConfirm({ required: true, minLength: 1 }, "long enough", true)).toBe(false);
  });
});

describe("confirmDialogReducer", () => {
  test("the reason is capped at 500 characters", () => {
    expect(CONFIRM_REASON_MAX_LENGTH).toBe(500);
    const next = confirmDialogReducer(INITIAL_CONFIRM_STATE, {
      type: "edit",
      text: "x".repeat(900),
    });
    expect(next.text).toHaveLength(500);
  });

  test("a second start while pending changes nothing", () => {
    const started = confirmDialogReducer(INITIAL_CONFIRM_STATE, { type: "start" });
    expect(started.pending).toBe(true);
    expect(confirmDialogReducer(started, { type: "start" })).toBe(started);
  });

  test("a rejection keeps the dialog's text, stops the pending flag and keeps the error", () => {
    const typed = confirmDialogReducer(INITIAL_CONFIRM_STATE, { type: "edit", text: "my reason" });
    const started = confirmDialogReducer(typed, { type: "start" });
    const error = new Error("boom");
    const rejected = confirmDialogReducer(started, { type: "rejected", error });
    expect(rejected).toEqual({ text: "my reason", pending: false, error, failed: true });
    // and a retry is allowed again
    expect(confirmDialogReducer(rejected, { type: "start" }).pending).toBe(true);
  });

  test("starting again clears the earlier error", () => {
    const rejected = confirmDialogReducer(INITIAL_CONFIRM_STATE, {
      type: "rejected",
      error: new Error("x"),
    });
    const again = confirmDialogReducer(rejected, { type: "start" });
    expect(again.failed).toBe(false);
    expect(again.error).toBeNull();
  });

  test("closing clears everything", () => {
    const typed = confirmDialogReducer(INITIAL_CONFIRM_STATE, { type: "edit", text: "abc" });
    expect(confirmDialogReducer(typed, { type: "reset" })).toEqual(INITIAL_CONFIRM_STATE);
  });

  test("a reset can start the next opening from a given text, capped at 500 characters", () => {
    const rejected = confirmDialogReducer(INITIAL_CONFIRM_STATE, {
      type: "rejected",
      error: new Error("x"),
    });
    expect(confirmDialogReducer(rejected, { type: "reset", text: "home visit passed" })).toEqual({
      ...INITIAL_CONFIRM_STATE,
      text: "home visit passed",
    });
    expect(
      confirmDialogReducer(INITIAL_CONFIRM_STATE, { type: "reset", text: "x".repeat(900) }).text,
    ).toHaveLength(500);
  });
});

describe("ConfirmActionDialog", () => {
  test("shows the title, the consequence and the verb, in English", () => {
    const html = renderAdminInEnglish(<ConfirmActionDialog {...base} reason="none" />);
    expect(html).toContain("Title here");
    expect(html).toContain("Consequence here");
    expect(html).toContain("Verb here");
    expect(html).toContain("Cancel");
    expect(html).not.toContain("<textarea");
    expectNoChineseText(html);
  });

  test("shows the same in Chinese, with the existing cancel wording", () => {
    const html = renderAdminInChinese(<ConfirmActionDialog {...base} reason="none" />);
    expect(html).toContain("Verb here");
    expect(html).toContain("取消");
    expect(html).not.toContain("<textarea");
  });

  test("renders nothing when closed", () => {
    expect(renderAdminInEnglish(<ConfirmActionDialog {...base} open={false} reason="none" />)).toBe(
      "",
    );
  });

  test("a required reason adds a field capped at 500 characters, labelled 原因 in Chinese", () => {
    const reason = { required: true, minLength: 5 } as const;
    const zh = renderAdminInChinese(<ConfirmActionDialog {...base} reason={reason} />);
    expect(zh).toContain("<textarea");
    expect(zh).toContain('maxLength="500"');
    expect(zh).toContain("原因");
    const en = renderAdminInEnglish(<ConfirmActionDialog {...base} reason={reason} />);
    expect(en).toContain("Reason");
    expect(en).toContain("Enter at least 5 characters.");
    expectNoChineseText(en);
  });

  test("the confirm button is disabled until a required reason is long enough", () => {
    const html = renderAdminInEnglish(
      <ConfirmActionDialog {...base} reason={{ required: true, minLength: 5 }} />,
    );
    expect(html).toMatch(/<button[^>]*data-action[^>]*disabled/);
  });

  test("a dialog without a reason has an enabled confirm button", () => {
    const html = renderAdminInEnglish(<ConfirmActionDialog {...base} reason="none" />);
    expect(html).not.toMatch(/<button[^>]*data-action[^>]*disabled/);
  });

  test("an initial reason fills the field when the dialog opens, and enables the confirm button", () => {
    const reason = { required: true, minLength: 5 } as const;
    const html = renderAdminInChinese(
      <ConfirmActionDialog {...base} reason={reason} initialReason="home visit passed" />,
    );
    expect(html).toMatch(/<textarea[^>]*>home visit passed<\/textarea>/);
    expect(html).not.toMatch(/<button[^>]*data-action[^>]*disabled/);
  });

  test("without an initial reason the field starts empty, as before", () => {
    const html = renderAdminInChinese(
      <ConfirmActionDialog {...base} reason={{ required: true, minLength: 1 }} />,
    );
    expect(html).toMatch(/<textarea[^>]*><\/textarea>/);
  });

  test("shows no error before the first attempt", () => {
    expect(renderAdminInEnglish(<ConfirmActionDialog {...base} reason="none" />)).not.toContain(
      'role="alert"',
    );
  });
});

describe("error text", () => {
  test("goes through adminErrorMessage, so a lapsed session reads in the active language", async () => {
    const { adminErrorMessage } = await import("../../lib/admin/session");
    expect(adminErrorMessage(new AdminSessionError("not_signed_in"), "en")).toContain(
      "Sign in again",
    );
    expect(adminErrorMessage(new AdminSessionError("not_signed_in"), "zh")).toBe("未登入");
  });
});

type Action = Parameters<typeof confirmDialogReducer>[1];

/** A fake dialog around `runConfirm`: the state the reducer keeps, and what was called. */
function fakeDialog(over: Partial<Parameters<typeof runConfirm>[0]> = {}) {
  const box = {
    state: INITIAL_CONFIRM_STATE,
    closed: [] as boolean[],
    calls: [] as (string | null)[],
  };
  const args = {
    open: true,
    reason: "none" as const,
    get state() {
      return box.state;
    },
    inFlight: { current: false },
    dispatch: (action: Action) => {
      box.state = confirmDialogReducer(box.state, action);
    },
    onConfirm: async (reason: string | null) => {
      box.calls.push(reason);
    },
    onOpenChange: (open: boolean) => {
      box.closed.push(open);
    },
    ...over,
  };
  return { box, args };
}

describe("runConfirm", () => {
  test("closes the dialog when the action resolves", async () => {
    const { box, args } = fakeDialog();
    await runConfirm(args);
    expect(box.calls).toEqual([null]);
    expect(box.closed).toEqual([false]);
    expect(box.state.pending).toBe(true); // the dialog resets itself when it closes
    expect(args.inFlight.current).toBe(false);
  });

  test("a rejection keeps the dialog open, with the typed reason and the error", async () => {
    const reason = { required: true, minLength: 3 } as const;
    const failure = new AdminSessionError("not_signed_in");
    const { box, args } = fakeDialog({
      reason,
      onConfirm: async () => {
        throw failure;
      },
    });
    box.state = confirmDialogReducer(box.state, { type: "edit", text: " because " });
    await runConfirm(args);
    expect(box.closed).toEqual([]);
    expect(box.state).toEqual({ text: " because ", pending: false, error: failure, failed: true });
    const { adminErrorMessage } = await import("../../lib/admin/session");
    expect(adminErrorMessage(box.state.error, "en")).toContain("Sign in again");
    // and the person can try again
    expect(args.inFlight.current).toBe(false);
  });

  test("passes the trimmed reason to the action", async () => {
    const { box, args } = fakeDialog({ reason: { required: true, minLength: 3 } });
    box.state = confirmDialogReducer(box.state, { type: "edit", text: "  because  " });
    await runConfirm(args);
    expect(box.calls).toEqual(["because"]);
  });

  test("a second click while the first is running does nothing", async () => {
    let release: () => void = () => {};
    const { box, args } = fakeDialog({
      onConfirm: (reason) => {
        box.calls.push(reason);
        return new Promise<void>((resolve) => {
          release = resolve;
        });
      },
    });
    const first = runConfirm(args);
    await runConfirm(args);
    expect(box.calls).toHaveLength(1);
    release();
    await first;
    expect(box.closed).toEqual([false]);
  });

  test("a click after the dialog has closed (the fade-out) does nothing", async () => {
    const { box, args } = fakeDialog({ open: false });
    await runConfirm(args);
    expect(box.calls).toEqual([]);
    expect(box.state.pending).toBe(false);
  });

  test("a reason that is too short does not run the action", async () => {
    const { box, args } = fakeDialog({ reason: { required: true, minLength: 5 } });
    await runConfirm(args);
    expect(box.calls).toEqual([]);
  });
});

describe("pending text", () => {
  test("reuses the existing zh wording, and reads Working… in English", () => {
    expect(confirmActionCopy.zh.working).toBe("處理中…");
    expect(confirmActionCopy.en.working).toBe("Working…");
  });
});
