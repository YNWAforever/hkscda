import { describe, expect, mock, test } from "bun:test";

/**
 * The void, estate, status, document and annual report dialogs print what their request helper
 * rejects with. Each API answers in English ("Document asset is still referenced"), so each helper
 * rethrows a failure as the dialog's shared failure line in the admin's language, and keeps a
 * lapsed session as it is. These tests drive every screen's own request helper with a failing
 * fetch, in Chinese and in English.
 */

const calls: Array<{ url: string; method: string | undefined }> = [];
let failure: unknown = null;
const failingFetch = async (url: string, init?: RequestInit) => {
  calls.push({ url, method: init?.method });
  if (failure !== null) throw failure;
  return { ok: true };
};
mock.module("../../lib/admin/http", () => ({
  fetchAdminJson: failingFetch,
  getAdminAccessToken: async () => "token",
}));
mock.module("./adoptions/api", () => ({ fetchCoordinatorJson: failingFetch }));

const { AdminHttpError, AdminSessionError, adminErrorMessage, adminSessionErrorText } =
  await import("../../lib/admin/session");
const { confirmActionCopy } = await import("./confirmActionCopy");
const { confirmActionFailure } = await import("./confirmActionFailure");
const { sendReceiptVoid } = await import("./donations/receiptVoid");
const { sendEstateDelete } = await import("./content/estateDelete");
const { sendStatusDelete } = await import("./adoptions/statusDelete");
const { annualReportDeleteRequest, documentDeleteRequest, sendDocumentDelete } =
  await import("./content/documentDelete");

type Language = "zh" | "en";
const ID = "33333333-3333-4333-8333-333333333333";

/** Each screen's request helper, as the screen calls it. */
const screens: Array<{
  name: string;
  file: string;
  call: RegExp;
  url: string;
  method: string;
  send: (language: Language) => Promise<unknown>;
}> = [
  {
    name: "payments: void a receipt",
    file: "src/components/admin/donations/PaymentsReconcile.tsx",
    call: /sendReceiptVoid\(request, language\)/,
    url: `/api/admin/receipts/${ID}/void`,
    method: "POST",
    send: (language) => sendReceiptVoid({ receiptId: ID, reason: "wrong donor" }, language),
  },
  {
    name: "supporter page: void a receipt",
    file: "src/components/admin/crm/SupporterDetail.tsx",
    call: /sendReceiptVoid\(request, language, supporterId\)/,
    url: `/api/admin/receipts/${ID}/void`,
    method: "POST",
    send: (language) =>
      sendReceiptVoid({ receiptId: ID, reason: "wrong donor" }, language, "supporter-1"),
  },
  {
    name: "estates: delete an estate",
    file: "src/components/admin/content/AdoptionInformationManagement.tsx",
    call: /sendEstateDelete\(\{ id: operation\.id, reason: operation\.reason \}, language\)/,
    url: "/api/admin/adoption-information",
    method: "DELETE",
    send: (language) => sendEstateDelete({ id: ID, reason: "listed in error" }, language),
  },
  {
    name: "statuses: delete a status",
    file: "src/components/admin/adoptions/StatusAdmin.tsx",
    call: /sendStatusDelete\(variables, language\)/,
    url: `/api/admin/adoptions/statuses/${ID}`,
    method: "DELETE",
    send: (language) => sendStatusDelete({ id: ID, reason: "merged" }, language),
  },
  {
    name: "documents: delete a document",
    file: "src/components/admin/content/DocumentManagement.tsx",
    call: /sendDocumentDelete\(request, adminLanguage\)/,
    url: `/api/admin/documents/${ID}`,
    method: "DELETE",
    send: (language) => sendDocumentDelete(documentDeleteRequest(ID, "duplicate")!, language),
  },
  {
    name: "annual reports: delete a report",
    file: "src/components/admin/content/AnnualReportManagement.tsx",
    call: /sendDocumentDelete\(request, language\)/,
    url: `/api/admin/annual-reports/${ID}`,
    method: "DELETE",
    send: (language) => sendDocumentDelete(annualReportDeleteRequest(ID, "duplicate")!, language),
  },
];

/** What the screen's request rejects with when the fetch fails with `cause`. */
async function rejection(send: () => Promise<unknown>, cause: unknown): Promise<unknown> {
  failure = cause;
  calls.length = 0;
  try {
    await send();
  } catch (error) {
    return error;
  } finally {
    failure = null;
  }
  throw new Error("the request did not reject");
}

describe("confirmActionFailure", () => {
  test("a server message becomes the dialog's failure line in the admin's language", () => {
    const cause = new AdminHttpError("Could not void receipt", 500);
    expect(confirmActionFailure(cause, "zh").message).toBe(confirmActionCopy.zh.failed);
    expect(confirmActionFailure(cause, "en").message).toBe(confirmActionCopy.en.failed);
  });

  test("anything that is not an Error also gets the failure line", () => {
    expect(confirmActionFailure("boom", "en").message).toBe(confirmActionCopy.en.failed);
    expect(confirmActionFailure(null, "zh").message).toBe(confirmActionCopy.zh.failed);
  });

  test("a lapsed session is returned as it is", () => {
    const session = new AdminSessionError("not_signed_in");
    expect(confirmActionFailure(session, "en")).toBe(session);
    const unauthorised = new AdminHttpError("API request failed", 401);
    expect(confirmActionFailure(unauthorised, "zh")).toBe(unauthorised);
  });
});

for (const screen of screens) {
  describe(screen.name, () => {
    test("the screen sends through this helper with the admin's language", async () => {
      expect(await Bun.file(screen.file).text()).toMatch(screen.call);
    });

    test("a zh admin sees the failure in Chinese, not the server's English", async () => {
      const cause = new AdminHttpError("Document asset is still referenced", 409);
      const error = await rejection(() => screen.send("zh"), cause);
      expect(calls).toEqual([{ url: screen.url, method: screen.method }]);
      expect(adminErrorMessage(error, "zh")).toBe(confirmActionCopy.zh.failed);
      expect(adminErrorMessage(error, "zh")).not.toContain("referenced");
    });

    test("an en admin sees the failure in English", async () => {
      const cause = new AdminHttpError("Document asset is still referenced", 409);
      const error = await rejection(() => screen.send("en"), cause);
      expect(adminErrorMessage(error, "en")).toBe(confirmActionCopy.en.failed);
    });

    test("an unknown failure (no response at all) gets the same generic line", async () => {
      const error = await rejection(() => screen.send("en"), new TypeError("Failed to fetch"));
      expect(adminErrorMessage(error, "en")).toBe(confirmActionCopy.en.failed);
    });

    test("a lapsed session passes through, so the dialog still says to sign in", async () => {
      const session = new AdminSessionError("not_signed_in");
      const error = await rejection(() => screen.send("en"), session);
      expect(error).toBe(session);
      expect(adminErrorMessage(error, "en")).toBe(adminSessionErrorText("not_signed_in", "en"));
      const unauthorised = new AdminHttpError("API request failed", 401);
      expect(await rejection(() => screen.send("zh"), unauthorised)).toBe(unauthorised);
    });
  });
}
