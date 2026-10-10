import { fetchAdminJson } from "../../../lib/admin/http";

export type EstateDeleteRequest = { id: string; reason: string };

/** What the estate screen sends to delete an estate: the chosen estate's id with the dialog's reason. */
export function estateDeleteRequest(
  id: string | null,
  reason: string | null,
): EstateDeleteRequest | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { id, reason: reason.trim() };
}

/** The DELETE call itself, kept apart from the screen so a test can check the request body. */
export function sendEstateDelete(request: EstateDeleteRequest) {
  return fetchAdminJson("/api/admin/adoption-information", {
    method: "DELETE",
    body: JSON.stringify({ id: request.id, reason: request.reason }),
  });
}
