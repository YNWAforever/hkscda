import type { volunteerOperationsCopy } from "./volunteerOperationsCopy";
import type { OperationPreviewData } from "./volunteerOperationsTypes";

const input =
  "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2";
const button =
  "min-h-11 rounded-md border border-[var(--color-border)] px-4 py-2 font-semibold disabled:opacity-50";

/**
 * The impact of a group change or a rescheduling, shown before staff or the volunteer confirm it.
 * It is written in the language of `copy`, so the public page passes it the Chinese half.
 */
export function OperationPreview({
  preview,
  copy,
  publicMode,
  destinationAccepted,
  onAccept,
  reason,
  onReason,
  applyDisabled,
  onApply,
}: {
  preview: OperationPreviewData;
  copy: typeof volunteerOperationsCopy.zh.preview;
  publicMode: boolean;
  destinationAccepted: boolean;
  onAccept: (accepted: boolean) => void;
  reason: string;
  onReason: (reason: string) => void;
  applyDisabled: boolean;
  onApply: () => void;
}) {
  return (
    <section className="space-y-4 rounded-lg border p-4">
      <h2 className="text-lg font-bold">{copy.title}</h2>
      {preview.apply_action === "group_apply" ? (
        <>
          <p>
            {copy.group(
              preview.manifest.group_headcount,
              preview.manifest.volunteer_capacity,
              preview.manifest.scenario === "confirmed_group"
                ? copy.scenarios.confirmed_group
                : copy.scenarios.other,
            )}
          </p>
          {preview.contact_snapshot && (
            <p>
              {preview.contact_snapshot.organisation} · {preview.contact_snapshot.contact_name} ·{" "}
              {preview.contact_snapshot.contact_phone}
            </p>
          )}
          {preview.late && <p>{copy.late}</p>}
        </>
      ) : (
        <p>{copy.move(preview.manifest.capacity, preview.manifest.remaining)}</p>
      )}
      {preview.apply_action === "move_apply" && (
        <div className="space-y-3">
          <h3>{copy.terms}</h3>
          <div
            className="max-h-64 overflow-auto whitespace-pre-wrap rounded border p-3"
            tabIndex={0}
          >
            {preview.terms_body}
          </div>
          {publicMode ? (
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={destinationAccepted}
                onChange={(event) => onAccept(event.target.checked)}
              />
              {copy.accept}
            </label>
          ) : (
            preview.consent_required && <p role="alert">{copy.staffCannotAccept}</p>
          )}
        </div>
      )}
      <label className="block space-y-1">
        <span className="text-sm font-semibold">{copy.reason}</span>
        <textarea
          aria-label={copy.reason}
          className={input}
          maxLength={1000}
          value={reason}
          onChange={(e) => onReason(e.target.value)}
        />
      </label>
      <button className={button} disabled={applyDisabled} onClick={onApply}>
        {copy.apply}
      </button>
    </section>
  );
}
