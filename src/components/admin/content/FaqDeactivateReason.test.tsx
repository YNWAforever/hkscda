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

const ENTRY = {
  id: "11111111-1111-4111-8111-111111111111",
  category: "sponsorship",
  question: { "zh-HK": "助養問題", en: "Sponsor question" },
  answer: { "zh-HK": "答案", en: "Answer" },
  keywords: { "zh-HK": [], en: [] },
  ctaKey: null,
  sensitive: false,
  sortOrder: 0,
  isActive: true,
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
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: queryKey[0] === "admin-faq-search-gaps" ? { days: 30, gaps: [] } : [ENTRY],
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
const { FaqManagement } = await import("./FaqManagement");
const { faqDeactivateRequest } = await import("./faqDeactivate");
const { faqCopy } = await import("./faqCopy");

type Request = { id: string; reason: string };

async function confirm(reason: string | null, mutate: (request: Request) => Promise<unknown>) {
  const request = faqDeactivateRequest(ENTRY.id, reason);
  if (request) await mutate(request);
}

describe("deactivating a FAQ entry asks for a reason", () => {
  test("the disable button opens the dialog instead of mutating directly", async () => {
    const source = await Bun.file("src/components/admin/content/FaqManagement.tsx").text();
    expect(source).not.toMatch(/onClick=\{\(\) => deactivateMutation\.mutate\(/);
    expect(source).toContain("setDeactivateTarget(entry.id)");
    // Nothing is mutated by rendering, and no dialog is open until a button is pressed.
    mutateCalls.length = 0;
    const markup = renderAdminInChinese(<FaqManagement />);
    expect(markup).not.toContain("<textarea");
    expect(mutateCalls).toEqual([]);
  });

  test("the dialog reuses the button wording, with no zh consequence and an English one", () => {
    expect(faqCopy.zh.list.disableConsequence).toBe("");
    expect(faqCopy.en.list.disableConsequence).not.toBe("");
    const dialog = (language: "zh" | "en") => (
      <ConfirmActionDialog
        open
        onOpenChange={() => {}}
        title={faqCopy[language].list.disable}
        consequence={faqCopy[language].list.disableConsequence}
        confirmLabel={faqCopy[language].list.disable}
        destructive
        reason={requiredReasonDialog}
        onConfirm={async () => {}}
      />
    );
    const zh = renderAdminInChinese(dialog("zh"));
    expect(zh).toContain("<textarea");
    expect(zh).toContain("原因");
    expect(zh).toContain("停用");
    const en = renderAdminInEnglish(dialog("en"));
    expect(en).toContain("<textarea");
    expect(en).toContain("Reason");
    expect(en).toContain("Disable");
    expect(en).toContain(faqCopy.en.list.disableConsequence);
  });

  // required-reason: faq.deactivate
  test("confirming sends the id with the trimmed reason", async () => {
    const mutate = mock(async (_request: Request) => undefined);
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: " duplicate question " },
      inFlight: { current: false },
      dispatch: () => {},
      onConfirm: (reason) => confirm(reason, mutate),
      onOpenChange: (open) => closed.push(open),
    });
    expect(mutate.mock.calls[0][0]).toEqual({ id: ENTRY.id, reason: "duplicate question" });
    expect(closed).toEqual([false]);
  });

  test("a rejecting mutation keeps the dialog open and the typed reason", async () => {
    const failure = new Error("boom");
    const actions: Array<{ type: string; error?: unknown }> = [];
    const closed: boolean[] = [];
    await runConfirm({
      open: true,
      reason: requiredReasonDialog,
      state: { ...INITIAL_CONFIRM_STATE, text: "duplicate question" },
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

  test("a blank reason, or no chosen entry, never builds a request", () => {
    expect(faqDeactivateRequest(ENTRY.id, "   ")).toBeNull();
    expect(faqDeactivateRequest(ENTRY.id, null)).toBeNull();
    expect(faqDeactivateRequest(null, "x")).toBeNull();
  });
});
