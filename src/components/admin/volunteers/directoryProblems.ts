import type { AdminLanguage } from "../../../lib/admin/language";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { pickAdminCopy } from "../i18n/copy";
import { volunteerDirectoryCopy } from "./volunteerDirectoryCopy";

/**
 * Why a selection of profiles could not be made, kept as a code and the error that caused it. The
 * directory writes the text when it renders, so a problem shown in Chinese reads in English after the
 * language is changed.
 */
export type SelectionProblem = { code: "select_failed" | "pin_failed"; cause?: unknown };

/** What went wrong in the reviewer panel, as a code and the error behind it. */
export type PanelProblem = {
  code: "load_saved" | "reload_saved" | "preview_failed" | "apply_failed";
  cause?: unknown;
};

/**
 * The text for a selection problem: the message of the error behind it when there is one (the
 * selection limits, a server refusal), otherwise the text of its code. Empty when nothing went wrong.
 */
export function selectionProblemMessage(problem: SelectionProblem | null, language: AdminLanguage) {
  if (!problem) return "";
  const copy = pickAdminCopy(volunteerDirectoryCopy, language).selection;
  return volunteerAdminErrorMessage(problem.cause, language) ?? copy.errors[problem.code];
}

/** The text for a problem in the reviewer panel, found the same way. Empty when nothing went wrong. */
export function reviewPanelProblemMessage(problem: PanelProblem | null, language: AdminLanguage) {
  if (!problem) return "";
  const copy = pickAdminCopy(volunteerDirectoryCopy, language).reviewPanel;
  return volunteerAdminErrorMessage(problem.cause, language) ?? copy.errors[problem.code];
}
