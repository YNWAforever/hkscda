import { fetchAdminJson } from "../../../lib/admin/http";
import type { AdminLanguage } from "../../../lib/admin/language";
import { contentActionFailure } from "./contentActionFailure";
import { governanceCopy } from "./governanceCopy";

export type BoardMemberDeactivateRequest = { id: string; reason: string };

/** What the governance screen sends to step a member down: the member's id with the dialog's reason. */
export function boardMemberDeactivateRequest(
  id: string | null,
  reason: string | null,
): BoardMemberDeactivateRequest | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { id, reason: reason.trim() };
}

/**
 * The DELETE call itself, kept apart from the screen so a test can check the request body. A
 * failure rejects with the screen's failure line (`stepDownFailed`) in `language`, never with the
 * API's English text, because the confirm dialog shows the rejection as it comes.
 */
export async function sendBoardMemberDeactivate(
  request: BoardMemberDeactivateRequest,
  language: AdminLanguage,
) {
  try {
    return await fetchAdminJson<{ ok: true }>("/api/admin/governance", {
      method: "DELETE",
      body: JSON.stringify({ id: request.id, reason: request.reason }),
    });
  } catch (cause) {
    throw contentActionFailure(cause, governanceCopy[language].stepDownFailed);
  }
}
