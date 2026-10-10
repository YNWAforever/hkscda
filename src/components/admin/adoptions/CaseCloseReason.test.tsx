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
const { caseDetailCopy } = await import("./caseDetailCopy");
const {
  caseStatusChangeRequest,
  inlineCaseStatusFailure,
  isClosingStatusChoice,
  sendCaseStatusChange,
} = await import("./caseStatusChange");

const CASE = "11111111-2222-4333-8444-555555555555";
const OPEN_STATUS = "33333333-4444-4333-8444-555555555555";
const CLOSED_STATUS = "66666666-7777-4666-8777-888888888888";
const STATUSES = [
  { id: OPEN_STATUS, isClosing: false },
  { id: CLOSED_STATUS, isClosing: true },
];
const SOURCE = "src/components/admin/adoptions/CaseDetail.tsx";

describe("the case screen asks for a reason before it closes or rejects a case", () => {
  test("a closing status opens the dialog; any other status submits as before", async () => {
    expect(isClosingStatusChoice(STATUSES, CLOSED_STATUS)).toBe(true);
    expect(isClosingStatusChoice(STATUSES, OPEN_STATUS)).toBe(false);
    expect(isClosingStatusChoice(STATUSES, "")).toBe(false);

    const source = await Bun.file(SOURCE).text();
    expect(source).toContain("const closing = isClosingStatusChoice(statuses, selectedStatusId)");
    const submit = source.slice(source.indexOf("function handleStatusSubmit"));
    const closingBranch = submit.slice(0, submit.indexOf("const request"));
    expect(closingBranch).toContain("if (closing) {");
    expect(closingBranch).toContain("setCloseOpen(true)");
    expect(submit.slice(0, submit.indexOf("\n  }\n"))).toContain("statusMutation.mutate(request)");
  });

  test("the dialog asks for a reason, and the glue awaits the mutation", async () => {
    const source = await Bun.file(SOURCE).text();
    const from = source.indexOf("open={closeOpen}");
    const dialog = source.slice(from, source.indexOf("/>", from));
    expect(dialog).toContain("reason={requiredReasonDialog}");
    expect(dialog).not.toContain('reason="none"');
    expect(dialog).toContain("await statusMutation.mutateAsync(request)");
    expect(source).toContain("required-reason: adoption_case.close");
    expect(source).toContain("mutationFn: (request) => sendCaseStatusChange(request)");
  });

  // required-reason: adoption_case.close
  test("confirming sends the status with the trimmed reason as the note", async () => {
    const mutate = mock(async (_request: unknown) => undefined);
    const closed: boolean[] = [];
    const reason = " applicant withdrew ";
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: reason },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: async (typed) => {
        const request = caseStatusChangeRequest({
          caseId: CASE,
          statusId: CLOSED_STATUS,
          closing: true,
          note: "ignored inline note",
          reason: typed,
        });
        if (request) await mutate(request);
      },
      onOpenChange: (open) => closed.push(open),
    });
    // The dialog's reason, trimmed, replaces the inline note.
    expect(mutate.mock.calls[0][0]).toEqual({
      caseId: CASE,
      body: { statusId: CLOSED_STATUS, note: reason.trim() },
    });
    expect(closed).toEqual([false]);
  });

  // required-reason: adoption_case.close
  test("the POST body carries the reason as the note", async () => {
    fetchCalls.length = 0;
    const reason = " applicant withdrew ";
    const request = caseStatusChangeRequest({
      caseId: CASE,
      statusId: CLOSED_STATUS,
      closing: true,
      note: "",
      reason,
    });
    expect(request).not.toBeNull();
    await sendCaseStatusChange(request!);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`/api/admin/adoptions/cases/${CASE}/status`);
    expect(fetchCalls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      statusId: CLOSED_STATUS,
      note: reason.trim(),
    });
  });

  test("a status that does not close keeps its optional note", () => {
    expect(
      caseStatusChangeRequest({
        caseId: CASE,
        statusId: OPEN_STATUS,
        closing: false,
        note: "  Phone screening completed ",
        reason: null,
      }),
    ).toEqual({
      caseId: CASE,
      body: { statusId: OPEN_STATUS, note: "Phone screening completed" },
    });
    expect(
      caseStatusChangeRequest({
        caseId: CASE,
        statusId: OPEN_STATUS,
        closing: false,
        note: "",
        reason: null,
      })?.body,
    ).toEqual({ statusId: OPEN_STATUS, note: undefined });
  });

  test("a closing status with a blank or missing reason never builds a request", () => {
    for (const reason of ["   ", null]) {
      expect(
        caseStatusChangeRequest({
          caseId: CASE,
          statusId: CLOSED_STATUS,
          closing: true,
          note: "an inline note does not count",
          reason,
        }),
      ).toBeNull();
    }
  });
});

describe("nothing typed in the inline note is lost when a closing status is chosen", () => {
  test("the inline note is disabled while a closing status is selected", async () => {
    const source = await Bun.file(SOURCE).text();
    const from = source.indexOf('id="case-status-note"');
    expect(from).toBeGreaterThan(0);
    const textarea = source.slice(from, source.indexOf("/>", from));
    expect(textarea).toContain("disabled={closing}");
  });

  test("the dialog opens with the inline note already in its reason field", async () => {
    const source = await Bun.file(SOURCE).text();
    const from = source.indexOf("open={closeOpen}");
    const dialog = source.slice(from, source.indexOf("/>", from));
    expect(dialog).toContain("initialReason={statusNote}");
  });

  test("so a carried note, confirmed as the reason, is what is sent", () => {
    // The dialog starts from the inline note; whatever it holds on confirm is the reason.
    expect(
      caseStatusChangeRequest({
        caseId: CASE,
        statusId: CLOSED_STATUS,
        closing: true,
        note: "Home visit passed",
        reason: "Home visit passed",
      })?.body,
    ).toEqual({ statusId: CLOSED_STATUS, note: "Home visit passed" });
  });
});

describe("a failed closing change is shown once, inside the dialog", () => {
  const failure = new Error("Could not change the case status");

  test("the inline alert leaves a failed closing request to the dialog", () => {
    expect(
      inlineCaseStatusFailure(STATUSES, failure, {
        caseId: CASE,
        body: { statusId: CLOSED_STATUS, note: "applicant withdrew" },
      }),
    ).toBeNull();
  });

  test("the inline alert still shows a failed non-closing request", () => {
    expect(
      inlineCaseStatusFailure(STATUSES, failure, {
        caseId: CASE,
        body: { statusId: OPEN_STATUS, note: undefined },
      }),
    ).toBe(failure);
  });

  test("no error, no alert", () => {
    expect(inlineCaseStatusFailure(STATUSES, null, undefined)).toBeNull();
  });

  test("the screen's inline alert goes through it", async () => {
    const source = await Bun.file(SOURCE).text();
    expect(source).toMatch(
      /inlineCaseStatusFailure\(\s*statuses,\s*statusMutation\.error,\s*statusMutation\.variables,?\s*\)/,
    );
    expect(source).toContain("adminErrorMessage(inlineFailure, language)");
    expect(source).not.toContain("{statusMutation.error && (");
  });
});

describe("the dialog in Chinese and in English", () => {
  const dialog = (language: "zh" | "en") => {
    const copy = caseDetailCopy[language];
    return (
      <ConfirmActionDialog
        open
        onOpenChange={() => {}}
        title={copy.saveStatus}
        consequence={copy.closeConsequence}
        confirmLabel={copy.saveStatus}
        destructive
        reason={requiredReasonDialog}
        onConfirm={async () => {}}
      />
    );
  };

  test("zh shows the reason field and no new consequence sentence", () => {
    const zh = renderAdminInChinese(dialog("zh"));
    expect(zh).toContain("<textarea");
    expect(zh).toContain("原因");
    expect(caseDetailCopy.zh.closeConsequence).toBe("");
  });

  test("en shows the reason field and the consequence", () => {
    const en = renderAdminInEnglish(dialog("en"));
    expect(en).toContain("<textarea");
    expect(en).toContain("Reason");
    expect(en).toContain("This status closes the case");
    expect(en).toContain("Save status");
  });
});
