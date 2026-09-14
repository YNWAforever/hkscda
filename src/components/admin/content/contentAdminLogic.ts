import type { ContentStatus, ContentType } from "../../../lib/content/types";

export const contentOptionalFieldLabels = {
  ctaLabel: "CTA 標籤",
  ctaUrl: "CTA 連結",
  seoTitle: "SEO 標題",
  seoDescription: "SEO 描述",
  ogTitle: "OG 標題",
  ogDescription: "OG 描述",
} as const;

export type ContentSearchInput = {
  q?: string;
  type?: ContentType | "all";
  status?: ContentStatus | "all";
  rescueRegion?: string;
  page?: number;
  pageSize?: number;
};

export type ContentStatusTone = "success" | "warning" | "muted";

export type ContentSummaryRow = {
  type: ContentType;
  status: ContentStatus;
};

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
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));

  return params;
}

export function contentStatusTone(status: ContentStatus): ContentStatusTone {
  if (status === "published") return "success";
  if (status === "draft") return "warning";
  return "muted";
}

export function formatContentTypeLabel(type: ContentType, language: "zh" | "en") {
  const labels: Record<ContentType, Record<"zh" | "en", string>> = {
    rescue_story: { zh: "救援故事", en: "Rescue Story" },
    event: { zh: "活動", en: "Event" },
    charity_market: { zh: "慈善市集", en: "Charity Market" },
    report: { zh: "報告", en: "Report" },
  };

  return labels[type][language];
}

export function suggestSlug(title: string) {
  return title
    .normalize("NFKD")
    .toLowerCase()
    .replace(/['’]/g, "-")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 180)
    .replace(/-+$/g, "");
}

export function summarizeContentRows(rows: ContentSummaryRow[]) {
  return rows.reduce(
    (summary, row) => ({
      total: summary.total + 1,
      published: summary.published + (row.status === "published" ? 1 : 0),
      drafts: summary.drafts + (row.status === "draft" ? 1 : 0),
      rescueStories: summary.rescueStories + (row.type === "rescue_story" ? 1 : 0),
    }),
    { total: 0, published: 0, drafts: 0, rescueStories: 0 },
  );
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
