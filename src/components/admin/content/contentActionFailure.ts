import { AdminSessionError } from "../../../lib/admin/session";

/**
 * What a content screen's confirm dialog shows when its mutation fails. The FAQ and governance
 * APIs answer with English text ("Board member not found"), which a zh-HK admin must not see, so
 * every failure becomes the screen's own failure line, already written in the admin's language.
 * A lapsed session is kept as it is: the dialog translates it, and it tells staff to sign in.
 */
export function contentActionFailure(cause: unknown, failedLine: string): Error {
  if (cause instanceof AdminSessionError) return cause;
  return new Error(failedLine);
}
