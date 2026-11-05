import type { AdoptionReturnResult, SuccessfulAdoption } from "../../../lib/adoptions/types";
import { fetchCoordinatorJson } from "./api";

export type AdoptionReturnRequest = {
  successfulAdoptionId: string;
  body: { reason: string };
};

/** Whether the panel offers "Record return": an adoption that has not been returned (BUG-33). */
export function canRecordAdoptionReturn(
  successfulAdoption: Pick<SuccessfulAdoption, "returnedAt"> | null,
): boolean {
  return Boolean(successfulAdoption) && !successfulAdoption?.returnedAt;
}

/** What the return dialog sends. A blank or missing reason builds nothing. */
export function adoptionReturnRequest(args: {
  successfulAdoptionId: string;
  reason: string | null;
}): AdoptionReturnRequest | null {
  const reason = (args.reason ?? "").trim();
  if (reason === "") return null;
  return { successfulAdoptionId: args.successfulAdoptionId, body: { reason } };
}

/** The POST itself, kept apart from the panel so a test can check the request body. */
export function sendAdoptionReturn(request: AdoptionReturnRequest) {
  return fetchCoordinatorJson<{ adoption: AdoptionReturnResult }>(
    `/api/admin/adoptions/successful-adoptions/${encodeURIComponent(request.successfulAdoptionId)}/return`,
    { method: "POST", body: JSON.stringify(request.body) },
  );
}
