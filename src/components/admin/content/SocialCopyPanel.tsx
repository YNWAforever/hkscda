import { useState } from "react";
import { Check, Copy, Wand2 } from "lucide-react";

import type { SocialCopyStatus, SocialCopyVariant } from "../../../lib/content/types";
import { StatusPill } from "../StatusBadge";
import { copyTextToClipboard } from "./contentAdminLogic";

const platformLabels: Record<SocialCopyVariant["platform"], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

type SocialCopyPanelProps = {
  copies: SocialCopyVariant[];
  onGenerate?: () => void;
  onUpdateStatus?: (copyId: string, status: SocialCopyStatus) => void;
  pendingCopyId?: string | null;
  generating?: boolean;
  disabled?: boolean;
};

export function SocialCopyPanel({
  copies,
  onGenerate,
  onUpdateStatus,
  pendingCopyId,
  generating = false,
  disabled = false,
}: SocialCopyPanelProps) {
  const [clipboardError, setClipboardError] = useState<string | null>(null);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-[var(--color-panel)]">社交平台文案</h2>
          <p className="text-sm text-[var(--color-text-muted)]">按平台整理可複製的宣傳文字。</p>
        </div>
        {onGenerate ? (
          <button
            type="button"
            disabled={disabled || generating}
            onClick={onGenerate}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
          >
            <Wand2 className="h-4 w-4" />
            {generating ? "產生中" : "產生文案"}
          </button>
        ) : null}
      </div>

      {clipboardError ? (
        <p className="rounded-lg border border-[var(--color-error)] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--color-error)]">
          {clipboardError}
        </p>
      ) : null}

      {copies.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
          尚未有社交平台文案。
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {copies.map((copy) => (
            <article
              key={copy.id}
              className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-bold text-[var(--color-panel)]">
                  {platformLabels[copy.platform]}
                </h3>
                <StatusPill tone={copy.status === "copied" ? "success" : "neutral"}>
                  {copy.status}
                </StatusPill>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text)]">
                {copy.copyText}
              </p>
              {copy.hashtags.length > 0 ? (
                <p className="mt-3 text-xs font-semibold text-[var(--color-primary)]">
                  {copy.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}
                </p>
              ) : null}
              {onUpdateStatus ? (
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={disabled || pendingCopyId === copy.id}
                    onClick={() => {
                      setClipboardError(null);
                      void copySocialText(copy)
                        .then(() => onUpdateStatus(copy.id, "copied"))
                        .catch((error) => {
                          setClipboardError(clipboardErrorMessage(error));
                        });
                    }}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-panel)] disabled:opacity-60"
                  >
                    <Copy className="h-3 w-3" />
                    複製
                  </button>
                  <button
                    type="button"
                    disabled={disabled || pendingCopyId === copy.id}
                    onClick={() => onUpdateStatus(copy.id, "archived")}
                    className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-panel)] disabled:opacity-60"
                  >
                    <Check className="h-3 w-3" />
                    封存
                  </button>
                </div>
              ) : null}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function socialClipboardText(copy: SocialCopyVariant) {
  const hashtags = copy.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ");
  return hashtags ? `${copy.copyText}\n\n${hashtags}` : copy.copyText;
}

function copySocialText(copy: SocialCopyVariant) {
  return copyTextToClipboard(socialClipboardText(copy));
}

function clipboardErrorMessage(error: unknown) {
  if (error instanceof Error) return `複製失敗：${error.message}`;
  return "複製失敗，請手動選取文字。";
}
