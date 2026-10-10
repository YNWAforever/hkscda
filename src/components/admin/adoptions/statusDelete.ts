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

/** The DELETE call itself, kept apart from the screen so a test can check the request body. */
export function sendStatusDelete(request: StatusDeleteRequest) {
  return fetchCoordinatorJson<DeleteResponse>(
    `/api/admin/adoptions/statuses/${encodeURIComponent(request.id)}`,
    { method: "DELETE", body: JSON.stringify({ reason: request.reason }) },
  );
}
