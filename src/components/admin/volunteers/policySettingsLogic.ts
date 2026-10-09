import { ZodError, type ZodIssue } from "zod";
import type { AdminLanguage } from "../../../lib/admin/language";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { localisePolicyMessage } from "../../../lib/volunteers/policy/messages";
import { pickAdminCopy } from "../i18n/copy";
import { policyChangeCopy } from "./policyChangeCopy";
import { policySettingsCopy } from "./policySettingsCopy";

/** What a staff member has to do before a command on the policy settings screen can run. */
export type PolicyInputCode = "save_and_date" | "preview_and_reason";

/**
 * A command the screen refused to send because something it needs is missing. The `message` stays
 * zh-HK, like the other errors that carry a code; the screen writes the text for its language with
 * `policyErrorMessage`.
 */
export class PolicyInputError extends Error {
  constructor(readonly code: PolicyInputCode) {
    super(policySettingsCopy.zh.errors[code]);
    this.name = "PolicyInputError";
  }
}

/** What the screen last did, as a code. It is written when it renders, so it follows the language. */
export type PolicyNotice =
  | { code: "draft_saved" }
  | { code: "published"; count: number }
  | { code: "generated" };

/** The text of a notice in `language`. */
export function policyNoticeText(notice: PolicyNotice, language: AdminLanguage): string {
  const copy = pickAdminCopy(policySettingsCopy, language).notices;
  if (notice.code === "published") return copy.published(notice.count);
  return copy[notice.code]();
}

/** How many problems of a draft the English message lists before it says how many more there are. */
const MAX_LISTED_ISSUES = 10;

/** Which of the texts for zod's own issues fits a problem the policy has no message for. */
function issueTextKey(issue: ZodIssue): string {
  switch (issue.code) {
    case "invalid_type":
    case "too_small":
    case "too_big":
    case "invalid_string":
    case "unrecognized_keys":
      return issue.code;
    case "invalid_enum_value":
    case "invalid_literal":
    case "invalid_union":
    case "invalid_union_discriminator":
      return "invalid_option";
    default:
      return "other";
  }
}

/**
 * The problems zod found in a policy draft, as lines the English admin can act on: the name of the
 * setting and what to do, never the field path or the JSON that zod writes.
 */
export function englishPolicyProblems(error: ZodError): string {
  const copy = pickAdminCopy(policySettingsCopy, "en").errors;
  const name = policyChangeCopy.en.issuePath;
  const lines = error.issues.slice(0, MAX_LISTED_ISSUES).map((issue) => {
    const text = localisePolicyMessage(issue.message, "en") ?? copy.issueTexts[issueTextKey(issue)];
    return copy.invalidLine(name(issue.path.join(".")), text);
  });
  const hidden = error.issues.length - lines.length;
  return [copy.invalidHeader, ...lines, ...(hidden > 0 ? [copy.moreProblems(hidden)] : [])].join(
    "\n",
  );
}

/** Whether an error says the draft changed under the staff member: HTTP 409. */
function isConflict(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && "status" in error && Number(error.status) === 409
  );
}

/**
 * The message for an error of a command on the policy settings screen, in `language`: the screen's own
 * refusals by code, a conflict, a draft zod refused (its problems, named, in English; the text zod
 * wrote, in Chinese) and any other error as the volunteer screens show it.
 */
export function policyErrorMessage(error: unknown, language: AdminLanguage): string {
  const copy = pickAdminCopy(policySettingsCopy, language).errors;
  if (error instanceof PolicyInputError) return copy[error.code];
  if (isConflict(error)) return copy.conflict;
  if (error instanceof ZodError)
    return language === "zh" ? error.message : englishPolicyProblems(error);
  return volunteerAdminErrorMessage(error, language) ?? copy.failed;
}
