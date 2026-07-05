import { Clock, Eye, EyeOff } from "lucide-react";

import type { StoryUpdate } from "../../../lib/content/types";
import { StatusPill } from "../StatusBadge";

const updateKindLabels: Record<StoryUpdate["kind"], string> = {
  medical: "醫療",
  care: "照顧",
  photo: "相片",
  foster: "寄養",
  adoption: "領養",
  general: "一般",
};

type ContentTimelineProps = {
  updates: StoryUpdate[];
  onGenerateDrafts?: (updateId: string) => void;
  generatingUpdateId?: string | null;
};

export function ContentTimeline({
  updates,
  onGenerateDrafts,
  generatingUpdateId,
}: ContentTimelineProps) {
  if (updates.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
        尚未有故事更新。
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {updates.map((update) => (
        <article
          key={update.id}
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        >
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill tone={update.visibility === "public" ? "success" : "neutral"}>
                  {update.visibility === "public" ? (
                    <Eye className="h-3 w-3" />
                  ) : (
                    <EyeOff className="h-3 w-3" />
                  )}
                  {update.visibility === "public" ? "公開" : "內部"}
                </StatusPill>
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-1 text-xs font-semibold text-[var(--color-panel)]">
                  {updateKindLabels[update.kind]}
                </span>
              </div>
              <h3 className="mt-2 text-base font-bold text-[var(--color-panel)]">{update.title}</h3>
              {update.body ? (
                <p className="mt-1 line-clamp-2 text-sm text-[var(--color-text-muted)]">
                  {update.body}
                </p>
              ) : null}
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-xs text-[var(--color-text-muted)]">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {formatDate(update.occurredAt)}
              </span>
              {onGenerateDrafts && update.shouldGenerateAdopterDrafts ? (
                <button
                  type="button"
                  disabled={generatingUpdateId === update.id}
                  onClick={() => onGenerateDrafts(update.id)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 font-semibold text-[var(--color-panel)] disabled:opacity-60"
                >
                  {generatingUpdateId === update.id ? "產生中" : "通知草稿"}
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" }).format(new Date(value));
}
