import { AdminSessionError } from "../../../lib/admin/session";

/**
 * Why an export did not complete. It is kept in state as this code, with the few numbers a
 * message needs, and the text is written from the copy in `exportCopy.ts` each time the bar
 * renders, so a failure shown before the language is changed reads in the new language.
 */
export type ExportFailure =
  /** The server answered 401. */
  | { code: "session_expired" }
  /** The server answered 403. */
  | { code: "forbidden" }
  /** An immediate export is over its row limit; `total` is the server's count, when it sent one. */
  | { code: "immediate_limit"; total: number | null }
  /** A background export is over its row limit. */
  | { code: "background_limit" }
  | { code: "server_error" }
  | { code: "incomplete" }
  /** There was no session to export with. */
  | { code: "sign_in_required" }
  /** The request or the download itself failed. */
  | { code: "network" }
  | { code: "background_failed" }
  | { code: "progress_failed" }
  /** `detail` is the message the failed request carried, shown as it came. */
  | { code: "create_failed"; detail?: string }
  | { code: "not_signed_in" }
  | { code: "cancel_failed" }
  | { code: "download_failed" };

/** Reads a failed export response into a code. It never keeps the response body's text. */
export async function classifyExportFailure(response: Response): Promise<ExportFailure> {
  if (response.status === 401) return { code: "session_expired" };
  if (response.status === 403) return { code: "forbidden" };
  if (response.status === 413) {
    const body = await response.json().catch(() => null);
    if (body?.limit === 20000) return { code: "background_limit" };
    return {
      code: "immediate_limit",
      total:
        typeof body?.total === "number" && Number.isSafeInteger(body.total) ? body.total : null,
    };
  }
  if (response.status >= 500) return { code: "server_error" };
  return { code: "incomplete" };
}

/** The error an export throws when the server refuses it, with the HTTP status that came back. */
export class CsvExportError extends Error {
  constructor(
    readonly failure: ExportFailure,
    readonly status: number,
  ) {
    super(failure.code);
  }
}

/**
 * The failure to show for an error thrown while a CSV was being fetched or downloaded. The
 * token lookup throws `AdminSessionError` when nobody is signed in; its code is what is
 * checked, not its zh-HK message.
 */
export function failureOfExportError(error: unknown): ExportFailure {
  if (error instanceof CsvExportError) return error.failure;
  if (error instanceof AdminSessionError && error.code === "not_signed_in") {
    return { code: "sign_in_required" };
  }
  return { code: "network" };
}

/**
 * The failure to show when a background export could not be created. A request the server
 * refused shows the server's reason; any other error shows the message it carried, as it
 * always has, except a missing session, which is written in the screen's language.
 */
export function failureOfCreateError(error: unknown): ExportFailure {
  if (error instanceof CsvExportError) return error.failure;
  if (error instanceof AdminSessionError && error.code === "not_signed_in") {
    return { code: "not_signed_in" };
  }
  return error instanceof Error
    ? { code: "create_failed", detail: error.message }
    : { code: "create_failed" };
}
