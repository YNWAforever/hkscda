import { AdminApiError } from "../../../lib/admin/session";
import { pickAdminCopy, type AdminLanguage } from "../i18n/copy";
import { contentApiErrorsCopy } from "./contentApiErrorsCopy";

/**
 * The lines for a content API error that carries a reason the screen can explain, in `language`
 * (zh-HK when none is given), or `null` for any other error, which the caller writes as before.
 *
 * - `not_published` (409): social copy and adopter notification drafts link to the public story
 *   page, so the server refuses them until the story is published (BUG-66).
 */
export function contentApiErrorLines(
  error: unknown,
  language: AdminLanguage = "zh",
): string[] | null {
  if (!(error instanceof AdminApiError)) return null;
  const copy = pickAdminCopy(contentApiErrorsCopy, language);
  if (error.code === "not_published") return [copy.notPublished];
  return null;
}
