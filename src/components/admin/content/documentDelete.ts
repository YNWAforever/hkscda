import { fetchAdminJson } from "../../../lib/admin/http";
import type { AdminLanguage } from "../../../lib/admin/language";
import { confirmActionFailure } from "../confirmActionFailure";

export type DocumentDeleteRequest = { endpoint: string; reason: string };

function deleteRequest(
  id: string | null,
  reason: string | null,
  endpoint: (encodedId: string) => string,
): DocumentDeleteRequest | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { endpoint: endpoint(encodeURIComponent(id)), reason: reason.trim() };
}

/** What the documents screen sends to delete a document: its endpoint with the dialog's reason. */
export function documentDeleteRequest(id: string | null, reason: string | null) {
  return deleteRequest(id, reason, (encodedId) => `/api/admin/documents/${encodedId}`);
}

/** What the annual reports screen sends to delete a report: its endpoint with the dialog's reason. */
export function annualReportDeleteRequest(id: string | null, reason: string | null) {
  return deleteRequest(id, reason, (encodedId) => `/api/admin/annual-reports/${encodedId}`);
}

/**
 * The DELETE call itself, kept apart from the screens so a test can check the request body. A
 * failure is shown inside the delete dialog, and the API answers in English ("Document asset is
 * still referenced"), so it is rethrown as the dialog's failure line in `language`; a lapsed
 * session is kept as it is.
 */
export async function sendDocumentDelete(request: DocumentDeleteRequest, language: AdminLanguage) {
  try {
    return await fetchAdminJson(request.endpoint, {
      method: "DELETE",
      body: JSON.stringify({ reason: request.reason }),
    });
  } catch (cause) {
    throw confirmActionFailure(cause, language);
  }
}
