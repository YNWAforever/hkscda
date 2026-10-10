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
mock.module("../../../lib/admin/http", () => ({
  fetchAdminJson: async (url: string, init?: RequestInit) => {
    fetchCalls.push({ url, init });
    return { ok: true };
  },
  getAdminAccessToken: async () => "token",
}));

const { renderAdminInChinese, renderAdminInEnglish } = await import("../i18n/testing");
const { ConfirmActionDialog } = await import("../ConfirmActionDialog");
const { INITIAL_CONFIRM_STATE, requiredReasonDialog, runConfirm } =
  await import("../confirmActionState");
const { documentsCopy } = await import("./documentsCopy");
const { annualReportDeleteRequest, documentDeleteRequest, sendDocumentDelete } =
  await import("./documentDelete");

const ASSET = "11111111-2222-4333-8444-555555555555";
const REPORT = "22222222-3333-4444-8555-666666666666";

const SCREENS = [
  {
    id: "document.delete",
    file: "src/components/admin/content/DocumentManagement.tsx",
    copyKey: "documents",
    builder: "documentDeleteRequest(id, reason ?? null)",
    base: "/api/admin/documents",
    request: documentDeleteRequest,
    uuid: ASSET,
  },
  {
    id: "annual_report.delete",
    file: "src/components/admin/content/AnnualReportManagement.tsx",
    copyKey: "annualReports",
    builder: "annualReportDeleteRequest(id, reason ?? null)",
    base: "/api/admin/annual-reports",
    request: annualReportDeleteRequest,
    uuid: REPORT,
  },
] as const;

describe("deleting a document or an annual report asks for a reason", () => {
  for (const screen of SCREENS) {
    describe(screen.id, () => {
      test("the screen's dialog asks for a reason and the delete button only opens it", async () => {
        const source = await Bun.file(screen.file).text();
        const from = source.indexOf("open={deleteId !== null}");
        const dialog = source.slice(from, source.indexOf("/>", from));
        expect(dialog).toContain("reason={requiredReasonDialog}");
        expect(dialog).not.toContain('reason="none"');
        expect(source).toContain("setDeleteId(");
        expect(source).toContain(`required-reason: ${screen.id}`);
      });

      test("the screen's glue: the dialog's reason reaches the mutation, which builds and sends the request", async () => {
        const source = await Bun.file(screen.file).text();
        // The dialog passes the reason on through onAction (which awaits the mutation's mutateAsync) ...
        expect(source).toContain("await onAction?.(");
        expect(source).toMatch(/onAction\?\.\(deleteId, "delete", [^)]*reason\)/);
        expect(source).toContain("mutateAsync({");
        expect(source).toMatch(/mutateAsync\(\{[^}]*reason[^}]*\}\)/);
        // ... and the mutation function builds the request from it and hands the result to the sender.
        expect(source).toContain(screen.builder);
        expect(source).toMatch(/return sendDocumentDelete\(request, (adminLanguage|language)\)/);
      });

      test("the dialog shows a reason field in Chinese and in English", () => {
        const dialog = (language: "zh" | "en") => {
          const copy = documentsCopy[language][screen.copyKey];
          return (
            <ConfirmActionDialog
              open
              onOpenChange={() => {}}
              title={copy.table.deleteLabel("Title")}
              consequence={copy.table.confirmDelete("Title")}
              confirmLabel={copy.table.deleteLabel("Title")}
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
      });

      // required-reason: document.delete
      // required-reason: annual_report.delete
      test("confirming passes the trimmed reason on, and closes the dialog", async () => {
        const mutate = mock(async (_request: { endpoint: string; reason: string }) => undefined);
        const closed: boolean[] = [];
        await runConfirm({
          open: true,
          reason: requiredReasonDialog,
          state: { ...INITIAL_CONFIRM_STATE, text: " duplicate upload " },
          inFlight: { current: false },
          dispatch: () => {},
          onConfirm: async (reason) => {
            const request = screen.request(screen.uuid, reason);
            if (request) await mutate(request);
          },
          onOpenChange: (open) => closed.push(open),
        });
        expect(mutate.mock.calls[0][0]).toEqual({
          endpoint: `${screen.base}/${screen.uuid}`,
          reason: "duplicate upload",
        });
        expect(closed).toEqual([false]);
      });

      // required-reason: document.delete
      // required-reason: annual_report.delete
      test("the DELETE request body carries the reason", async () => {
        fetchCalls.length = 0;
        const request = screen.request(screen.uuid, " duplicate upload ");
        expect(request).not.toBeNull();
        await sendDocumentDelete(request!, "zh");
        expect(fetchCalls).toHaveLength(1);
        expect(fetchCalls[0].url).toBe(`${screen.base}/${screen.uuid}`);
        expect(fetchCalls[0].init?.method).toBe("DELETE");
        expect(JSON.parse(String(fetchCalls[0].init?.body))).toEqual({
          reason: "duplicate upload",
        });
      });

      test("a blank reason, or no chosen row, never builds a request", () => {
        expect(screen.request(screen.uuid, "   ")).toBeNull();
        expect(screen.request(screen.uuid, null)).toBeNull();
        expect(screen.request(null, "x")).toBeNull();
      });
    });
  }
});
