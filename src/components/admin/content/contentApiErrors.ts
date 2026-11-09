import { AdminApiError, type AdminApiErrorFields } from "../../../lib/admin/session";
import { pickAdminCopy, type AdminLanguage } from "../i18n/copy";
import { contentApiErrorsCopy } from "./contentApiErrorsCopy";
import { editorCopy } from "./editorCopy";

type Reasons = (typeof contentApiErrorsCopy)["zh"]["reasons"];

/** The label of each content field, as the editor's basic content form names it. */
export function editorFieldLabels(language: AdminLanguage): Record<string, string> {
  const copy = pickAdminCopy(editorCopy, language);
  const form = copy.form;
  const metadata = copy.metadata;
  return {
    type: form.type,
    slug: form.slug,
    title: form.title,
    subtitle: form.subtitle,
    summary: form.summary,
    body: form.body,
    ctaLabel: form.ctaLabel,
    ctaUrl: form.ctaUrl,
    seoTitle: form.seoTitle,
    seoDescription: form.seoDescription,
    ogTitle: form.ogTitle,
    ogDescription: form.ogDescription,
    // The publication-metadata panel's fields (CMS-03): its zod issue paths are these keys.
    contentClass: metadata.classification,
    sourceReference: metadata.source,
    contentOwner: metadata.owner,
    effectiveFrom: metadata.effectiveFrom,
    effectiveUntil: metadata.effectiveUntil,
  };
}

// admin-copy-exempt: a pattern that detects Chinese text, not interface text
const HAS_CHINESE = /[㐀-鿿]/;

/**
 * One validation message in `language`. The content API sends zod's English text (or a schema's
 * own message); the ones the content schemas produce are recognised and written in the admin's
 * language. Anything else is shown as it came in English, and in Chinese only when it is already
 * Chinese, so a zh-HK admin never reads an English reason.
 */
function fieldReason(
  field: string,
  message: string,
  language: AdminLanguage,
  reasons: Reasons,
): string {
  const tooLong = /at most (\d+) character/.exec(message);
  if (tooLong) return reasons.tooLong(tooLong[1]);
  if (message === "Required" || /at least 1 character/.test(message)) return reasons.required;
  if (message === "Effective until must be after effective from") return reasons.effectiveRange;
  const tooShort = /at least (\d+) character/.exec(message);
  if (tooShort) return reasons.tooShort(tooShort[1]);
  const tooLarge = /less than or equal to (-?[\d.]+)/.exec(message);
  if (tooLarge) return reasons.tooLarge(tooLarge[1]);
  const tooSmall = /greater than or equal to (-?[\d.]+)/.exec(message);
  if (tooSmall) return reasons.tooSmall(tooSmall[1]);
  if (/^CTA URL must be/.test(message)) return reasons.ctaUrl;
  if (/^Invalid enum value/.test(message)) return reasons.invalidChoice;
  if (field === "slug" && message === "Invalid") return reasons.slug;
  if (/^Invalid( url| uuid| datetime| date)?$/.test(message)) return reasons.invalid;
  if (language === "en") return message || reasons.unknown;
  return HAS_CHINESE.test(message) ? message : reasons.unknown;
}

/**
 * One line per message of a validation failure, `label: reason`, in `language`. A field is named
 * by `labels` when it has one there, and by its key otherwise; a failure of the whole request
 * (key `form`) has no label.
 */
export function contentFieldErrorLines(
  fields: AdminApiErrorFields,
  language: AdminLanguage = "zh",
  labels: Record<string, string> = editorFieldLabels(language),
): string[] {
  const copy = pickAdminCopy(contentApiErrorsCopy, language);
  return Object.entries(fields).flatMap(([field, messages]) =>
    messages.map((message) => {
      const reason = fieldReason(field, message, language, copy.reasons);
      return field === "form" ? reason : copy.fieldLine(labels[field] ?? field, reason);
    }),
  );
}

/**
 * The lines for a content API error that carries a reason the screen can explain, in `language`
 * (zh-HK when none is given), or `null` for any other error, which the caller writes as before.
 *
 * - `not_published` (409): social copy and adopter notification drafts link to the public story
 *   page, so the server refuses them until the story is published (BUG-66).
 * - `invalid` with `fields` (400): a validation failure, named field by field with the editor's
 *   labels (BUG-68). Without fields it is left to the lifecycle text.
 */
export function contentApiErrorLines(
  error: unknown,
  language: AdminLanguage = "zh",
): string[] | null {
  if (!(error instanceof AdminApiError)) return null;
  const copy = pickAdminCopy(contentApiErrorsCopy, language);
  if (error.code === "not_published") return [copy.notPublished];
  if (error.code === "invalid" && error.fields && Object.keys(error.fields).length > 0) {
    return [copy.invalidHeading, ...contentFieldErrorLines(error.fields, language)];
  }
  return null;
}
