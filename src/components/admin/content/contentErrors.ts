import { contentCommonCopy } from "./contentCommonCopy";

/** Why a content logic module refused to go on. The text of each code is in `contentCommonCopy`. */
export type ContentErrorCode = keyof typeof contentCommonCopy.zh.errors;

/**
 * Thrown by the content logic modules (the media upload, the editor's operation gate and the
 * editor's own checks). Its `message` is the zh-HK text it always was, so code that shows it as it
 * is keeps working; a screen reads `code` and writes the message for the admin's language.
 */
export class ContentAdminError extends Error {
  constructor(readonly code: ContentErrorCode) {
    super(contentCommonCopy.zh.errors[code]);
    this.name = "ContentAdminError";
  }
}

/**
 * An error as a screen keeps it: the `code` of a content error, or the caught error itself when the
 * server may have given a reason. The text is written when the screen renders, in the admin's
 * language: `copy.errors[code]` for a code, `adminErrorMessage(cause, language)` otherwise.
 */
export type ContentFailure = { code?: ContentErrorCode; cause?: unknown };

export function contentFailure(cause: unknown): ContentFailure {
  return cause instanceof ContentAdminError ? { code: cause.code } : { cause };
}
