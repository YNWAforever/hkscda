import { fetchAdminJson } from "../../../lib/admin/http";
import type { AdminLanguage } from "../../../lib/admin/language";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { volunteerErrorMessage } from "../../../lib/volunteers/apiResult";

export type RegistrationStatusChangeBody = {
  status: string;
  expectedUpdatedAt: string | undefined;
  reason?: string;
};

/**
 * The status PATCH both volunteer screens make. A failed rejection is shown inside the reject
 * dialog, which prints the rejection as it comes, while `fetchAdminJson` writes every `/volunteers`
 * failure in zh-HK; so that rejection is rethrown with `volunteerAdminErrorMessage` in `language`.
 * Any other status change rejects with the API error unchanged, for the screen's inline alert.
 */
export async function sendRegistrationStatusChange(
  registrationId: string,
  body: RegistrationStatusChangeBody,
  language: AdminLanguage,
) {
  try {
    return await fetchAdminJson(`/api/admin/volunteers/registrations/${registrationId}/status`, {
      method: "PATCH",
      body: JSON.stringify({
        status: body.status,
        expectedUpdatedAt: body.expectedUpdatedAt,
        reason: body.reason,
      }),
    });
  } catch (cause) {
    if (body.status !== "rejected") throw cause;
    throw new Error(
      volunteerAdminErrorMessage(cause, language) ?? volunteerErrorMessage({}, 500, language),
    );
  }
}
