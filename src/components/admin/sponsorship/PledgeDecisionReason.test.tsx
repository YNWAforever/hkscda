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
mock.module("../adoptions/api", () => ({
  fetchCoordinatorJson: async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return { ok: true };
  },
}));

const { renderAdminInChinese, renderAdminInEnglish } = await import("../i18n/testing");
const { ConfirmActionDialog } = await import("../ConfirmActionDialog");
const { INITIAL_CONFIRM_STATE, requiredReasonDialog, runConfirm } =
  await import("../confirmActionState");
const { pledgePageCopy } = await import("../pageCopy/pledgeCopy");
const { pledgeCancelRequest, pledgeReviewCommand, pledgeReviewRequest, sendPledgeDecision } =
  await import("./pledgeDecision");

const PLEDGE = "11111111-2222-4333-8444-555555555555";
const PROOF = { id: "33333333-3333-4333-8333-333333333333", revision: 4 };
const KEY = "55555555-5555-4555-8555-555555555555";
const SOURCE = "src/components/admin/sponsorship/PledgeDetailDrawer.tsx";

describe("the drawer asks for a reason to reject a proof or cancel a pledge", () => {
  const DIALOGS = [
    {
      id: "sponsorship_proof.reject",
      open: "rejectOpen",
      setter: "setRejectOpen",
      mutation: "rejectMutation",
    },
    {
      id: "sponsorship_pledge.cancel",
      open: "cancelOpen",
      setter: "setCancelOpen",
      mutation: "cancelMutation",
    },
  ] as const;
  for (const { id, open, setter, mutation } of DIALOGS) {
    test(`${id}: the dialog asks for a reason, and the glue awaits the mutation`, async () => {
      const source = await Bun.file(SOURCE).text();
      const from = source.indexOf(`open={${open}}`);
      const dialog = source.slice(from, source.indexOf("/>", from));
      expect(dialog).toContain("reason={requiredReasonDialog}");
      expect(dialog).not.toContain('reason="none"');
      // The reason reaches the mutation; its rejection keeps the dialog open with the text.
      expect(dialog).toContain(`await ${mutation}.mutateAsync(reason ?? "")`);
      expect(source).toContain(`required-reason: ${id}`);
      expect(source).toContain(`onClick={() => ${setter}(true)}`);
    });
  }

  test("each mutation builds its request from the reason and sends it", async () => {
    const source = await Bun.file(SOURCE).text();
    expect(source).toContain('pledgeReviewCommand(pledge.currentProof, "reject", reason)');
    expect(source).toContain("sendPledgeDecision(pledgeReviewRequest(pledgeId, command,");
    expect(source).toContain("pledgeCancelRequest(pledgeId, reason)");
    expect(source).toContain("return sendPledgeDecision(request)");
  });

  test("the inline cancel note is gone, and approving keeps its optional note", async () => {
    const source = await Bun.file(SOURCE).text();
    expect(source).not.toContain("pledge-cancel-note");
    expect(source).not.toContain("cancelNote");
    expect(source).toContain('pledgeReviewCommand(pledge.currentProof, "approve", reviewNote)');
  });
});

describe("the dialogs in Chinese and in English", () => {
  for (const kind of ["reviewProof", "cancel"] as const) {
    test(kind, () => {
      const dialog = (language: "zh" | "en") => {
        const copy = pledgePageCopy[language].pledgeReview;
        const label = kind === "reviewProof" ? copy.reviewProof.reject : copy.cancel.action;
        const consequence =
          kind === "reviewProof"
            ? copy.reviewProof.rejectConsequence
            : copy.cancel.confirmConsequence;
        return (
          <ConfirmActionDialog
            open
            onOpenChange={() => {}}
            title={label}
            consequence={consequence}
            confirmLabel={label}
            destructive
            reason={requiredReasonDialog}
            onConfirm={async () => {}}
          />
        );
      };
      const zh = renderAdminInChinese(dialog("zh"));
      expect(zh).toContain("<textarea");
      expect(zh).toContain("原因");
      const en = renderAdminInEnglish(dialog("en"));
      expect(en).toContain("<textarea");
      expect(en).toContain("Reason");
      expect(en).toContain(
        kind === "reviewProof" ? "Rejecting this payment proof" : "Cancelling ends",
      );
    });
  }
});

describe("what is sent", () => {
  // required-reason: sponsorship_pledge.cancel
  test("cancelling sends the trimmed reason as the note, and closes the dialog", async () => {
    fetchCalls.length = 0;
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: " Sponsor moved overseas " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: async (reason) => {
        const request = pledgeCancelRequest(PLEDGE, reason);
        if (request) await sendPledgeDecision(request);
      },
      onOpenChange: (open) => closed.push(open),
    });
    expect(fetchCalls).toHaveLength(1);
    expect(fetchCalls[0].url).toBe(`/api/admin/sponsorships/pledges/${PLEDGE}/cancel`);
    expect(fetchCalls[0].init?.method).toBe("POST");
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      note: "Sponsor moved overseas",
    });
    expect(closed).toEqual([false]);
  });

  // required-reason: sponsorship_proof.reject
  test("rejecting sends the trimmed reason as the note with the review key", async () => {
    fetchCalls.length = 0;
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: " Blurry receipt " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: async (reason) => {
        const command = pledgeReviewCommand(PROOF, "reject", reason);
        if (command) await sendPledgeDecision(pledgeReviewRequest(PLEDGE, command, KEY));
      },
      onOpenChange: () => {},
    });
    expect(fetchCalls[0].url).toBe(`/api/admin/sponsorships/pledges/${PLEDGE}/review`);
    expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
      decision: "reject",
      note: "Blurry receipt",
      proofId: PROOF.id,
      expectedRevision: 4,
      idempotencyKey: KEY,
    });
  });

  // required-reason: sponsorship_proof.reject
  // required-reason: sponsorship_pledge.cancel
  test("a rejection keeps the typed text and leaves the dialog open", async () => {
    const actions: string[] = [];
    const closed: boolean[] = [];
    const state = { ...INITIAL_CONFIRM_STATE, text: "Blurry receipt" };
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state,
      inFlight: { current: false },
      dispatch: (action) => actions.push(action.type),
      onConfirm: async () => {
        throw new Error("Sponsorship pledge is already cancelled");
      },
      onOpenChange: (open) => closed.push(open),
    });
    expect(actions).toEqual(["start", "rejected"]);
    expect(closed).toEqual([]);
    expect(state.text).toBe("Blurry receipt");
  });

  test("approving builds a request with or without a note; a blank reject or cancel builds none", () => {
    expect(pledgeReviewCommand(PROOF, "approve", null)).toEqual({
      decision: "approve",
      note: undefined,
      proofId: PROOF.id,
      expectedRevision: 4,
    });
    expect(pledgeReviewCommand(PROOF, "approve", " ok ")?.note).toBe("ok");
    expect(pledgeReviewCommand(PROOF, "reject", "   ")).toBeNull();
    expect(pledgeReviewCommand(PROOF, "reject", null)).toBeNull();
    expect(pledgeCancelRequest(PLEDGE, "  ")).toBeNull();
    expect(pledgeCancelRequest(PLEDGE, null)).toBeNull();
  });
});
