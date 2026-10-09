import { adminErrorMessage } from "../../../lib/admin/session";
import { defineAdminCopy } from "./copyModule";

/**
 * Writes a caught error for the screen's language. A missing-session error is translated; any
 * other error shows the message it carries, as the server sent it; anything that is not an
 * error shows `fallback`. A screen keeps the caught `cause` in state and calls this when it
 * renders, so the text follows a language change instead of staying as it was when the error
 * happened.
 */
export const errorTextCopy = defineAdminCopy({
  zh: {
    describe: (cause: unknown, fallback: string) => adminErrorMessage(cause, "zh") ?? fallback,
  },
  en: {
    describe: (cause: unknown, fallback: string) => adminErrorMessage(cause, "en") ?? fallback,
  },
});
