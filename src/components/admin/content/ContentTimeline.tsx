import { useState } from "react";
import { fetchAdminJson } from "../../../lib/admin/http";
import { Clock, Eye, EyeOff } from "lucide-react";

import type { StoryUpdate } from "../../../lib/content/types";
import { useAdminCopy } from "../i18n/copy";
import { StatusPill } from "../StatusBadge";
import { contentCommonCopy } from "./contentCommonCopy";
import { editorPanelsCopy } from "./editorPanelsCopy";

type ContentTimelineProps = {
  updates: StoryUpdate[];
  onGenerateDrafts?: (updateId: string) => void;
  generatingUpdateId?: string | null;
  disabled?: boolean;
};

export function ContentTimeline({
  updates,
  onGenerateDrafts,
  generatingUpdateId,
  disabled = false,
}: ContentTimelineProps) {
  const copy = useAdminCopy(editorPanelsCopy).timeline;
  const common = useAdminCopy(contentCommonCopy);
  if (updates.length === 0) {
    return (
      <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-text-muted)]">
        {copy.empty}
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
                  {common.visibility[update.visibility]}
                </StatusPill>
                <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-1 text-xs font-semibold text-[var(--color-panel)]">
                  {common.updateKinds[update.kind]}
                </span>
              </div>
              <h3 className="mt-2 text-base font-bold text-[var(--color-panel)]">{update.title}</h3>
              <UpdateBody update={update} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2 text-xs text-[var(--color-text-muted)]">
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {common.date(update.occurredAt)}
              </span>
              {onGenerateDrafts && update.shouldGenerateAdopterDrafts ? (
                <button
                  type="button"
                  disabled={disabled || generatingUpdateId === update.id}
                  onClick={() => onGenerateDrafts(update.id)}
                  className="rounded-md border border-[var(--color-border)] px-2 py-1 font-semibold text-[var(--color-panel)] disabled:opacity-60"
                >
                  {generatingUpdateId === update.id ? copy.creating : copy.createDrafts}
                </button>
              ) : null}
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

function UpdateBody({ update }: { update: StoryUpdate }) {
  const copy = useAdminCopy(editorPanelsCopy).timeline;
  const [body, setBody] = useState(update.body);
  const [loaded, setLoaded] = useState(update.bodyLoaded !== false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  if (loaded)
    return body ? (
      <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-text-muted)]">{body}</p>
    ) : (
      <p className="text-sm">{copy.noBody}</p>
    );
  return (
    <div>
      <button
        type="button"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(false);
          try {
            const data = await fetchAdminJson<{ body: string | null }>(
              `/api/admin/content/${update.contentItemId}?updateId=${update.id}`,
            );
            setBody(data.body);
            setLoaded(true);
          } catch {
            setError(true);
          } finally {
            setPending(false);
          }
        }}
        className="mt-2 text-sm underline"
      >
        {pending ? copy.loading : copy.readBody}
      </button>
      {error ? <p role="alert">{copy.bodyFailed}</p> : null}
    </div>
  );
}
