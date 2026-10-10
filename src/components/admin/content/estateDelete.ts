import { fetchAdminJson } from "../../../lib/admin/http";
import type { AdminLanguage } from "../../../lib/admin/language";
import { confirmActionFailure } from "../confirmActionFailure";

export type EstateDeleteRequest = { id: string; reason: string };

/** What the estate screen sends to delete an estate: the chosen estate's id with the dialog's reason. */
export function estateDeleteRequest(
  id: string | null,
  reason: string | null,
): EstateDeleteRequest | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { id, reason: reason.trim() };
}

/**
 * The DELETE call itself, kept apart from the screen so a test can check the request body. A
 * failure is shown inside the delete dialog, and the API answers in English, so it is rethrown as
 * the dialog's failure line in `language`; a lapsed session is kept as it is.
 */
export async function sendEstateDelete(request: EstateDeleteRequest, language: AdminLanguage) {
  try {
    return await fetchAdminJson("/api/admin/adoption-information", {
      method: "DELETE",
      body: JSON.stringify({ id: request.id, reason: request.reason }),
    });
  } catch (cause) {
    throw confirmActionFailure(cause, language);
  }
}
