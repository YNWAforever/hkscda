import type { AdminLanguage } from "../../lib/admin/language";
import { confirmActionCopy } from "./confirmActionCopy";
import { isLapsedSession } from "./failureClass";
import { pickAdminCopy } from "./i18n/copy";

/**
 * What a confirm dialog shows when its request fails, for the screens whose API answers with
 * English text ("Document asset is still referenced", "Could not void receipt") and has no message
 * of its own in the admin's language: the dialog's shared failure line, written in `language`.
 * A lapsed session (an `AdminSessionError`, or any error carrying status 401) is kept as it is, so
 * the dialog still tells staff to sign in and the expiry redirect still sees it.
 */
export function confirmActionFailure(cause: unknown, language: AdminLanguage): Error {
  if (cause instanceof Error && isLapsedSession(cause)) return cause;
  return new Error(pickAdminCopy(confirmActionCopy, language).failed);
}
