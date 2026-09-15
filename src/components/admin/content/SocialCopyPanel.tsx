import { useEffect, useState } from "react";
import { Check, Copy, Save, Wand2 } from "lucide-react";

import type { SocialCopyStatus, SocialCopyVariant } from "../../../lib/content/types";
import { StatusPill } from "../StatusBadge";
import { copyTextToClipboard } from "./contentAdminLogic";

const platformLabels: Record<SocialCopyVariant["platform"], string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
};

export type SocialCopyPatch = {
  copyText: string;
  hashtags: string[];
};

type SocialCopyPanelProps = {
  copies: SocialCopyVariant[];
  onGenerate?: () => void;
  onUpdateStatus?: (copyId: string, status: SocialCopyStatus) => void;
  onSave?: (copyId: string, patch: SocialCopyPatch) => void;
  pendingCopyId?: string | null;
  savingCopyId?: string | null;
  generating?: boolean;
  disabled?: boolean;
};

export function SocialCopyPanel({
  copies,
  onGenerate,
  onUpdateStatus,
  onSave,
  pendingCopyId,
  savingCopyId,
  generating = false,
  disabled = false,
}: SocialCopyPanelProps) {
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

      {copies.length === 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
          尚未有社交平台文案。
        </p>
      ) : (
        <div className="grid gap-3 lg:grid-cols-3">
          {copies.map((copy) => (
            <SocialCopyCard
              key={copy.id}
              copy={copy}
              onUpdateStatus={onUpdateStatus}
              onSave={onSave}
              pending={pendingCopyId === copy.id}
              saving={savingCopyId === copy.id}
              disabled={disabled}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function SocialCopyCard({
  copy,
  onUpdateStatus,
  onSave,
  pending,
  saving,
  disabled,
}: {
  copy: SocialCopyVariant;
  onUpdateStatus?: (copyId: string, status: SocialCopyStatus) => void;
  onSave?: (copyId: string, patch: SocialCopyPatch) => void;
  pending: boolean;
  saving: boolean;
  disabled: boolean;
}) {
  const [clipboardError, setClipboardError] = useState<string | null>(null);
  const savedHashtags = copy.hashtags.join(" ");
  const [draftText, setDraftText] = useState(copy.copyText);
  const [draftHashtags, setDraftHashtags] = useState(savedHashtags);

  useEffect(() => {
    setDraftText(copy.copyText);
    setDraftHashtags(savedHashtags);
  }, [copy.copyText, savedHashtags]);

  const parsedHashtags = parseHashtags(draftHashtags);
  const dirty = draftText !== copy.copyText || !sameHashtags(parsedHashtags, copy.hashtags);
  const canSave = Boolean(onSave) && dirty && draftText.trim().length > 0 && !disabled && !saving;

  return (
    <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-[var(--color-panel)]">{platformLabels[copy.platform]}</h3>
        <StatusPill tone={copy.status === "copied" ? "success" : "neutral"}>
          {copy.status}
        </StatusPill>
      </div>

      {clipboardError ? (
        <p className="mt-3 rounded-lg border border-[var(--color-error)] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--color-error)]">
          {clipboardError}
        </p>
      ) : null}

      {onSave ? (
        <div className="mt-3 space-y-3">
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            文案
            <textarea
              rows={6}
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm leading-6 text-[var(--color-text)]"
            />
          </label>
          <label className="block text-xs font-semibold text-[var(--color-text-muted)]">
            標籤（以空格分隔）
            <input
              value={draftHashtags}
              onChange={(event) => setDraftHashtags(event.target.value)}
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm text-[var(--color-text)]"
            />
          </label>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => onSave(copy.id, { copyText: draftText, hashtags: parsedHashtags })}
            className="inline-flex items-center gap-2 rounded-md bg-[var(--color-primary)] px-2 py-1 text-xs font-bold text-[var(--color-primary-foreground)] disabled:opacity-60"
          >
            <Save className="h-3 w-3" />
            {saving ? "儲存中" : "儲存"}
          </button>
        </div>
      ) : (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-[var(--color-text)]">
            {copy.copyText}
          </p>
          {copy.hashtags.length > 0 ? (
            <p className="mt-3 text-xs font-semibold text-[var(--color-primary)]">
              {copy.hashtags.map((tag) => `#${tag.replace(/^#/, "")}`).join(" ")}
            </p>
          ) : null}
        </>
      )}

      {onUpdateStatus ? (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={disabled || pending}
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
            disabled={disabled || pending}
            onClick={() => onUpdateStatus(copy.id, "archived")}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-panel)] disabled:opacity-60"
          >
            <Check className="h-3 w-3" />
            封存
          </button>
        </div>
      ) : null}
    </article>
  );
}

function parseHashtags(value: string) {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function sameHashtags(left: string[], right: string[]) {
  return left.length === right.length && left.every((tag, index) => tag === right[index]);
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
