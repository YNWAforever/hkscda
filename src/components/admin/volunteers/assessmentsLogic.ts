import { ZodError } from "zod";
import type { AdminLanguage } from "../../../lib/admin/language";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { pickAdminCopy } from "../i18n/copy";
import { assessmentsCopy, type AssessmentMessage } from "./assessmentsCopy";

/**
 * The text of what the assessment page last did, in `language`. A failure keeps the error behind it:
 * saved settings that zod could not read are named in English, and any other error is written the way
 * the volunteer screens write theirs. A message with nothing to say is the empty text.
 */
export function assessmentMessageText(message: AssessmentMessage, language: AdminLanguage): string {
  const copy = pickAdminCopy(assessmentsCopy, language);
  if (message.code === "error") {
    if (message.cause instanceof ZodError) {
      return language === "zh" ? message.cause.message : copy.unreadable;
    }
    return volunteerAdminErrorMessage(message.cause, language) ?? copy.failed;
  }
  if (message.code === "run_done") return copy.messages.run_done(message.profiles);
  return copy.messages[message.code];
}
