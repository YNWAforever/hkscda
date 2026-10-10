import { fetchAdminJson } from "../../../lib/admin/http";

export type BoardMemberDeactivateRequest = { id: string; reason: string };

/** What the governance screen sends to step a member down: the member's id with the dialog's reason. */
export function boardMemberDeactivateRequest(
  id: string | null,
  reason: string | null,
): BoardMemberDeactivateRequest | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { id, reason: reason.trim() };
}

/** The DELETE call itself, kept apart from the screen so a test can check the request body. */
export function sendBoardMemberDeactivate(request: BoardMemberDeactivateRequest) {
  return fetchAdminJson<{ ok: true }>("/api/admin/governance", {
    method: "DELETE",
    body: JSON.stringify({ id: request.id, reason: request.reason }),
  });
}
