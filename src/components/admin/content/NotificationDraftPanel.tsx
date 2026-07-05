import { CheckCircle2, Copy, Mail, MessageCircle, XCircle } from "lucide-react";

import type {
  NotificationDraftStatus,
  RecipientNotificationDraft,
} from "../../../lib/content/types";
import { StatusPill } from "../StatusBadge";

type NotificationDraftPanelProps = {
  drafts: RecipientNotificationDraft[];
  onUpdateStatus?: (draftId: string, status: NotificationDraftStatus) => void;
  pendingDraftId?: string | null;
  disabled?: boolean;
};

export function NotificationDraftPanel({
  drafts,
  onUpdateStatus,
  pendingDraftId,
  disabled = false,
}: NotificationDraftPanelProps) {
  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-bold text-[var(--color-panel)]">通知草稿</h2>
        <p className="text-sm text-[var(--color-text-muted)]">給領養人或支持者的手動通知草稿。</p>
      </div>

      {drafts.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
          尚未有通知草稿。
        </p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <article
              key={draft.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusPill tone={draft.status === "sent_manually" ? "success" : "neutral"}>
                      {draft.status}
                    </StatusPill>
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-text-muted)]">
                      {draft.channel === "email" ? (
                        <Mail className="h-3 w-3" />
                      ) : (
                        <MessageCircle className="h-3 w-3" />
                      )}
                      {draft.channel}
                    </span>
                  </div>
                  <h3 className="mt-2 font-bold text-[var(--color-panel)]">
                    {draft.recipientName}
                  </h3>
                  <p className="text-xs text-[var(--color-text-muted)]">{draft.recipientContact}</p>
                </div>
                {onUpdateStatus ? (
                  <div className="flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={disabled || pendingDraftId === draft.id}
                      onClick={() => {
                        void copyTextToClipboard(draft.body).finally(() =>
                          onUpdateStatus(draft.id, "copied"),
                        );
                      }}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-panel)] disabled:opacity-60"
                    >
                      <Copy className="h-3 w-3" />
                      複製
                    </button>
                    <button
                      type="button"
                      disabled={disabled || pendingDraftId === draft.id}
                      onClick={() => onUpdateStatus(draft.id, "sent_manually")}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-panel)] disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-3 w-3" />
                      已手動送出
                    </button>
                    <button
                      type="button"
                      disabled={disabled || pendingDraftId === draft.id}
                      onClick={() => onUpdateStatus(draft.id, "dismissed")}
                      className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-panel)] disabled:opacity-60"
                    >
                      <XCircle className="h-3 w-3" />
                      略過
                    </button>
                  </div>
                ) : null}
              </div>
              {draft.subject ? (
                <p className="mt-3 text-sm font-semibold text-[var(--color-panel)]">
                  {draft.subject}
                </p>
              ) : null}
              <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text)]">
                {draft.body}
              </p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function copyTextToClipboard(text: string) {
  if (typeof navigator === "undefined" || !navigator.clipboard?.writeText) {
    return Promise.resolve();
  }

  return navigator.clipboard.writeText(text);
}
