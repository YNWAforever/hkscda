import type { AdminLanguage } from "../../../lib/admin/language";
import { confirmActionFailure } from "../confirmActionFailure";
import { fetchCoordinatorJson } from "./api";

export type StatusDeleteRequest = { id: string; reason: string };

type DeleteResponse = { ok: boolean };

/** What the status screen sends to delete a status: the chosen status's id with the dialog's reason. */
export function statusDeleteRequest(
  id: string | null,
  reason: string | null,
): StatusDeleteRequest | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { id, reason: reason.trim() };
}

/**
 * The DELETE call itself, kept apart from the screen so a test can check the request body. A
 * failure is shown inside the delete dialog, and the API answers in English, so it is rethrown as
 * the dialog's failure line in `language`; a lapsed session is kept as it is.
 */
export async function sendStatusDelete(request: StatusDeleteRequest, language: AdminLanguage) {
  try {
    return await fetchCoordinatorJson<DeleteResponse>(
      `/api/admin/adoptions/statuses/${encodeURIComponent(request.id)}`,
      { method: "DELETE", body: JSON.stringify({ reason: request.reason }) },
    );
  } catch (cause) {
    throw confirmActionFailure(cause, language);
  }
}
