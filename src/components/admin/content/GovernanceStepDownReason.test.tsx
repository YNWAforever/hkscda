import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";

const realReactQuery = await import("@tanstack/react-query");

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
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return { ok: true };
  },
  getAdminAccessToken: async () => "token",
}));

const MEMBER = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Member",
  roleTitle: "Chair",
  sortOrder: 0,
  effectiveDate: "2026-08-01",
  isActive: true,
  createdAt: "2026-08-01T00:00:00Z",
  updatedAt: "2026-08-01T00:00:00Z",
};

const mutateCalls: unknown[] = [];
mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useMutation: () => ({
    mutate: (input: unknown) => mutateCalls.push(input),
    mutateAsync: async () => {},
    isPending: false,
    isError: false,
  }),
  useQuery: () => ({
    data: [MEMBER],
    error: null,
    isLoading: false,
    isError: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

const { renderAdminInChinese, renderAdminInEnglish } = await import("../i18n/testing");
const { ConfirmActionDialog } = await import("../ConfirmActionDialog");
const { INITIAL_CONFIRM_STATE, requiredReasonDialog, runConfirm } =
  await import("../confirmActionState");
const { GovernanceManagement } = await import("./GovernanceManagement");
const { boardMemberDeactivateRequest, sendBoardMemberDeactivate } =
  await import("./governanceDeactivate");
const { governanceCopy } = await import("./governanceCopy");

type Request = { id: string; reason: string };

async function confirm(reason: string | null, mutate: (request: Request) => Promise<unknown>) {
  const request = boardMemberDeactivateRequest(MEMBER.id, reason);
  if (request) await mutate(request);
}

describe("stepping a board member down asks for a reason", () => {
  test("the step-down button opens the dialog instead of mutating directly", async () => {
    const source = await Bun.file("src/components/admin/content/GovernanceManagement.tsx").text();
    expect(source).not.toMatch(/onClick=\{\(\) => deactivateMutation\.mutate\(/);
    expect(source).toContain("setStepDownTarget(member.id)");
    mutateCalls.length = 0;
    const markup = renderAdminInChinese(<GovernanceManagement />);
    expect(markup).not.toContain("<textarea");
    expect(mutateCalls).toEqual([]);
  });

  test("the dialog reuses the button wording, with no zh consequence and an English one", () => {
    expect(governanceCopy.zh.stepDownConsequence).toBe("");
    expect(governanceCopy.en.stepDownConsequence).not.toBe("");
    const dialog = (language: "zh" | "en") => (
      <ConfirmActionDialog
        open
        onOpenChange={() => {}}
        title={governanceCopy[language].table.stepDown}
        consequence={governanceCopy[language].stepDownConsequence}
        confirmLabel={governanceCopy[language].table.stepDown}
        destructive
        reason={requiredReasonDialog}
        onConfirm={async () => {}}
      />
    );
    const zh = renderAdminInChinese(dialog("zh"));
    expect(zh).toContain("<textarea");
    expect(zh).toContain("原因");
    expect(zh).toContain("卸任");
    const en = renderAdminInEnglish(dialog("en"));
    expect(en).toContain("<textarea");
    expect(en).toContain("Reason");
    expect(en).toContain("Mark as stepped down");
    expect(en).toContain(governanceCopy.en.stepDownConsequence);
  });

  // required-reason: board_member.deactivate
  test("confirming sends the id with the trimmed reason", async () => {
    const mutate = mock(async (_request: Request) => undefined);
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: " term ended " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: (reason) => confirm(reason, mutate),
      onOpenChange: (open) => closed.push(open),
    });
    expect(mutate.mock.calls[0][0]).toEqual({ id: MEMBER.id, reason: "term ended" });
    expect(closed).toEqual([false]);
  });

  // required-reason: board_member.deactivate
  test("the DELETE request body carries the id and the reason", async () => {
    fetchCalls.length = 0;
    const request = boardMemberDeactivateRequest(MEMBER.id, " term ended ");
    expect(request).not.toBeNull();
    await sendBoardMemberDeactivate(request!);
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe("/api/admin/governance");
    expect(fetchCalls[0].init?.method).toBe("DELETE");
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      id: MEMBER.id,
      reason: "term ended",
    });
  });

  test("a rejecting mutation keeps the dialog open and the typed reason", async () => {
    const failure = new Error("boom");
    const actions: Array<{ type: string; error?: unknown }> = [];
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: "term ended" },
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

  test("a blank reason, or no chosen member, never builds a request", () => {
    expect(boardMemberDeactivateRequest(MEMBER.id, "   ")).toBeNull();
    expect(boardMemberDeactivateRequest(MEMBER.id, null)).toBeNull();
    expect(boardMemberDeactivateRequest(null, "x")).toBeNull();
  });
});
