import { adminErrorMessage } from "../../../lib/admin/session";
import { pickAdminCopy, type AdminLanguage } from "../i18n/copy";
import { documentsCopy } from "./documentsCopy";

/** Why the document code refused to go on. The text of each code is in `documentsCopy`. */
export type DocumentErrorCode = keyof typeof documentsCopy.zh.errors;

/**
 * Thrown by `uploadDocumentPdf` and by the documents, annual reports and post-adoption guide
 * screens before they call the server. Its `message` is the zh-HK text it always was, so code
 * that shows it as it is keeps working; a screen reads `code` and writes the message for the
 * admin's language with `documentErrorMessage`.
 */
export class DocumentAdminError extends Error {
  constructor(readonly code: DocumentErrorCode) {
    super(documentsCopy.zh.errors[code]);
    this.name = "DocumentAdminError";
  }
}

/**
 * The message for a caught error in `language`: the text of a `DocumentAdminError` code, else what
 * `adminErrorMessage` gives (a session error is translated, any other `Error` keeps its own
 * message, which may come from the server). `null` for anything that is not an `Error`.
 */
export function documentErrorMessage(
  error: unknown,
  language: AdminLanguage = "zh",
): string | null {
  if (error instanceof DocumentAdminError) {
    return pickAdminCopy(documentsCopy, language).errors[error.code];
  }
  return adminErrorMessage(error, language);
}
