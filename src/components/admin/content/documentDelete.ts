import { fetchAdminJson } from "../../../lib/admin/http";

export type DocumentDeleteRequest = { endpoint: string; reason: string };

function deleteRequest(
  base: string,
  id: string | null,
  reason: string | null,
): DocumentDeleteRequest | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { endpoint: `${base}/${encodeURIComponent(id)}`, reason: reason.trim() };
}

/** What the documents screen sends to delete a document: its endpoint with the dialog's reason. */
export function documentDeleteRequest(id: string | null, reason: string | null) {
  return deleteRequest("/api/admin/documents", id, reason);
}

/** What the annual reports screen sends to delete a report: its endpoint with the dialog's reason. */
export function annualReportDeleteRequest(id: string | null, reason: string | null) {
  return deleteRequest("/api/admin/annual-reports", id, reason);
}

/** The DELETE call itself, kept apart from the screens so a test can check the request body. */
export function sendDocumentDelete(request: DocumentDeleteRequest) {
  return fetchAdminJson(request.endpoint, {
    method: "DELETE",
    body: JSON.stringify({ reason: request.reason }),
  });
}
