import type { AdminLanguage } from "../../../lib/admin/language";
import { CONTENT_SLUG_MAX } from "../../../lib/content/limits";
import type {
  ContentStatus,
  ContentType,
  NotificationDraftStatus,
  StoryUpdateVisibility,
} from "../../../lib/content/types";
import { contentCommonCopy } from "./contentCommonCopy";

/**
 * Whether an image added to `storyUpdateId` ("" for the whole item) may be set as the cover. The
 * database refuses an internal update's image as the cover (BUG-69), so the editor does not offer it.
 */
export function canSetMediaAsCover(
  updates: readonly { id: string; visibility: StoryUpdateVisibility }[],
  storyUpdateId: string,
): boolean {
  if (!storyUpdateId) return true;
  return updates.find((update) => update.id === storyUpdateId)?.visibility !== "internal";
}

export type ContentSearchInput = {
  q?: string;
  type?: ContentType | "all";
  status?: ContentStatus | "all";
  rescueRegion?: string;
  publishedFrom?: string;
  publishedTo?: string;
  mapVisibility?: "on" | "off" | "all";
  hasUpdate?: "yes" | "no" | "all";
  draftState?: NotificationDraftStatus | "all";
  page?: number;
  pageSize?: number;
};

export type ContentStatusTone = "success" | "warning" | "muted";

export type ClipboardWriter = {
  writeText: (text: string) => Promise<void>;
};

export function buildContentSearchParams(input: ContentSearchInput = {}) {
  const params = new URLSearchParams();
  const query = input.q?.trim();
  const rescueRegion = input.rescueRegion?.trim();
  const page = boundInteger(input.page ?? 1, 1, 50);
  const pageSize = boundInteger(input.pageSize ?? 25, 1, 50);

  if (query) params.set("q", query);
  if (input.type && input.type !== "all") params.set("type", input.type);
  if (input.status && input.status !== "all") params.set("status", input.status);
  if (rescueRegion) params.set("rescueRegion", rescueRegion);

  const publishedFrom = input.publishedFrom?.trim();
  const publishedTo = input.publishedTo?.trim();
  if (publishedFrom) params.set("publishedFrom", publishedFrom);
  if (publishedTo) params.set("publishedTo", publishedTo);
  if (input.mapVisibility && input.mapVisibility !== "all")
    params.set("mapVisibility", input.mapVisibility);
  if (input.hasUpdate && input.hasUpdate !== "all") params.set("hasUpdate", input.hasUpdate);
  if (input.draftState && input.draftState !== "all") params.set("draftState", input.draftState);

  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  return params;
}

export function contentStatusTone(status: ContentStatus): ContentStatusTone {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "muted";
}

export function formatContentTypeLabel(type: ContentType, language: AdminLanguage) {
  return contentCommonCopy[language].types[type];
}

export function suggestSlug(title: string) {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, CONTENT_SLUG_MAX)
    .replace(/-+$/g, "");
}

/**
 * The three filtered list requests behind the summary cards (CMS-04).
 *
 * The cards used to count the rows of the current page (at most 25), so "Published" changed
 * as staff paged through identical filters. Each request below asks for one row and reads the
 * response's `total` — the filtered count over the whole list. `page` is pinned to 1 so
 * paging can never change a total, and the other active filters (search, region, dates, map,
 * updates, drafts) are kept so the card still describes the list being shown.
 */
export function buildContentSummarySearches(input: ContentSearchInput = {}) {
  const base = { ...input, page: 1, pageSize: 1 };
  return {
    published: buildContentSearchParams({ ...base, status: "published" }).toString(),
    drafts: buildContentSearchParams({ ...base, status: "draft" }).toString(),
    rescueStories: buildContentSearchParams({ ...base, type: "rescue_story" }).toString(),
  };
}

/** A list response as far as the summary cards are concerned: only `total` may be read. */
export type ContentListTotalResponse = { total: number; items?: readonly unknown[] };

export type ContentSummaryTotals = {
  published: number;
  drafts: number;
  rescueStories: number;
};

/**
 * The card figures from the three filtered responses. Only `total` is used — the `items`
 * array is at most one row (`pageSize=1`) and must never become a card figure. When any
 * response is missing the totals are unknown, so the view renders the unavailable marker
 * instead of a page-derived number (CMS-04).
 */
export function contentSummaryTotals(responses: {
  published?: ContentListTotalResponse;
  drafts?: ContentListTotalResponse;
  rescueStories?: ContentListTotalResponse;
}): ContentSummaryTotals | undefined {
  const { published, drafts, rescueStories } = responses;
  if (!published || !drafts || !rescueStories) return undefined;
  return {
    published: published.total,
    drafts: drafts.total,
    rescueStories: rescueStories.total,
  };
}

export function formatIsoForDatetimeLocal(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const localDate = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return localDate.toISOString().slice(0, 16);
}

export function parseDatetimeLocalToIso(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return null;

  const date = new Date(trimmed);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

export function copyTextToClipboard(text: string, clipboard?: ClipboardWriter) {
  const writer = clipboard ?? currentClipboard();
  if (!writer) {
    return Promise.reject(new Error("Clipboard is not available in this browser."));
  }

  return writer.writeText(text);
}

function boundInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function currentClipboard() {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) return null;
  return navigator.clipboard;
}
