import { fetchAdminJson } from "../../../lib/admin/http";
import type { AdminLanguage } from "../../../lib/admin/language";
import { contentActionFailure } from "./contentActionFailure";
import { faqCopy } from "./faqCopy";

export type FaqDeactivateRequest = { id: string; reason: string };

/** What the FAQ screen sends to disable an entry: the chosen entry's id with the dialog's reason. */
export function faqDeactivateRequest(
  id: string | null,
  reason: string | null,
): FaqDeactivateRequest | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { id, reason: reason.trim() };
}

/**
 * The DELETE call the screen's mutation makes. A failure rejects with the screen's failure line
 * (`list.disableFailed`) in `language`, never with the API's English text, because the confirm
 * dialog shows the rejection as it comes.
 */
export async function sendFaqDeactivate(request: FaqDeactivateRequest, language: AdminLanguage) {
  try {
    return await fetchAdminJson<{ ok: true }>("/api/admin/faq", {
      method: "DELETE",
      body: JSON.stringify(request),
    });
  } catch (cause) {
    throw contentActionFailure(cause, faqCopy[language].list.disableFailed);
  }
}
