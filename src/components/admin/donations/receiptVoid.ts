import { fetchAdminJson } from "../../../lib/admin/http";
import type { AdminLanguage } from "../../../lib/admin/language";
import { confirmActionFailure } from "../confirmActionFailure";
import type { VoidReceiptRequest } from "./paymentsReconcileLogic";

/**
 * The void POST both receipt screens make (payments and the supporter page, which also sends the
 * supporter's id). A failure is shown inside the void dialog, and the API answers in English, so it
 * is rethrown as the dialog's failure line in `language`; a lapsed session is kept as it is.
 */
export async function sendReceiptVoid(
  request: VoidReceiptRequest,
  language: AdminLanguage,
  supporterId?: string,
) {
  try {
    return await fetchAdminJson(`/api/admin/receipts/${request.receiptId}/void`, {
      method: "POST",
      body: JSON.stringify({ supporterId, reason: request.reason }),
    });
  } catch (cause) {
    throw confirmActionFailure(cause, language);
  }
}
