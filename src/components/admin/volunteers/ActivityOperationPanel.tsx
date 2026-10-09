import { volunteerErrorMessage } from "../../../lib/volunteers/apiResult";
import type { reviewBulkOperation } from "../../../lib/volunteers/bulk/review";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { activityOperationCopy, BULK_OPERATIONS } from "./activityOperationCopy";
import { activityWorkspaceCopy } from "./activityWorkspaceCopy";
import type { Item, Operation, OperationNotification, Template } from "./activityWorkspaceTypes";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";

const button =
  "min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm " +
  "cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";

/** Which line describes a notification: delivered, failed, follow-up done, accepted, queued or waiting. */
function notificationState(
  n: OperationNotification,
): "delivered" | "failed" | "completed" | "accepted" | "queued" | "waiting" {
  if (n.queue_status === "delivered") return "delivered";
  if (n.queue_status === "failed") return "failed";
  if (n.follow_up === "completed") return "completed";
  if (n.provider_message_id) return "accepted";
  if (n.queue_status === "queued") return "queued";
  return "waiting";
}

/**
 * Step 3 of the activity workspace: the saved operation, its batches and what was done to each
 * item. The page owns what staff have ticked as reviewed and what is running.
 */
export function ActivityOperationPanel({
  operation,
  review,
  templates,
  showOperation,
  onToggleShow,
  onRefresh,
  reviewAll,
  onReviewAll,
  reviewed,
  onReview,
  sequencePending,
  applyPending,
  onSequence,
  onApply,
}: {
  operation: Operation;
  review: ReturnType<typeof reviewBulkOperation>;
  templates: Template[];
  showOperation: boolean;
  onToggleShow: () => void;
  onRefresh: () => void;
  reviewAll: boolean;
  onReviewAll: (checked: boolean) => void;
  reviewed: number[];
  onReview: (index: number, checked: boolean) => void;
  sequencePending: boolean;
  applyPending: boolean;
  onSequence: () => void;
  onApply: (index: number) => void;
}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(activityOperationCopy, language);
  const workspace = pickAdminCopy(activityWorkspaceCopy, language);
  const common = pickAdminCopy(volunteerCommonCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const text = copy.progress;
  const states: Record<string, string> = workspace.states;
  const stateLabel = (state: string) => states[state] ?? common.unknown(state);
  const policyName = (item: Item) =>
    templates.find(
      (candidate) =>
        candidate.version_id === item.policy_version_id ||
        candidate.template_key === item.template_key,
    )?.name ?? (item.policy_version_id ? text.policyToCheck : text.policyUnbound);
  const operationLabel = (BULK_OPERATIONS as readonly string[]).includes(operation.action)
    ? copy.operations[operation.action as keyof typeof copy.operations]
    : undefined;
  const pendingGroups = operation.groups.filter((group) => group.state === "pending").length;
  return (
    <section className="space-y-3" aria-label={text.label}>
      <div className="flex gap-2">
        <h2 className="text-lg font-bold">{text.heading(operationLabel)}</h2>
        <button className={button} onClick={onToggleShow}>
          {showOperation ? text.hidePreview : text.showPreview}
        </button>
        <button className={button} onClick={onRefresh}>
          {text.refresh}
        </button>
      </div>
      <p>
        {text.saved(
          format.sessionTime(operation.created_at),
          format.sessionTime(operation.expires_at),
        )}
      </p>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt>{text.eligible}</dt>
          <dd className="font-bold">{format.number(review.eligible)}</dd>
        </div>
        <div>
          <dt>{text.skipped}</dt>
          <dd className="font-bold">{format.number(review.skipped)}</dd>
        </div>
        <div>
          <dt>{text.conflicted}</dt>
          <dd className="font-bold">{format.number(review.conflicted)}</dd>
        </div>
        <div>
          <dt>{text.failed}</dt>
          <dd className="font-bold">{format.number(review.failed)}</dd>
        </div>
      </dl>
      {review.canRunSequentially ? (
        <div className="rounded-lg border border-[var(--color-border)] p-3">
          <label className="flex min-h-11 items-center gap-2">
            <input
              type="checkbox"
              checked={reviewAll}
              onChange={(event) => onReviewAll(event.target.checked)}
            />
            {text.reviewedAll(pendingGroups)}
          </label>
          <button
            className={button}
            disabled={!reviewAll || sequencePending || applyPending}
            onClick={onSequence}
          >
            {sequencePending ? text.runningSequence : text.runSequence}
          </button>
          <p className="text-sm">{text.sequenceNote}</p>
        </div>
      ) : (
        <p className="text-sm">{text.reviewEach}</p>
      )}
      {operation.groups.some((group) => group.state === "conflicted") && (
        <p role="alert">{text.conflictAlert}</p>
      )}
      <details className="text-sm">
        <summary className="cursor-pointer">{text.technical}</summary>
        <p>{text.technicalText(operation.id)}</p>
      </details>
      <div aria-label={text.notificationsLabel}>
        {operation.notifications?.length ? (
          operation.notifications.map((n) => (
            <p key={n.id}>
              {text.notificationLine(
                n.kind === "volunteer_operation_changed"
                  ? text.notificationKinds.staff
                  : text.notificationKinds.other,
                text.notificationStates[notificationState(n)],
                n.completed_at ? format.sessionTime(n.completed_at) : null,
              )}
            </p>
          ))
        ) : (
          <p>{text.noNotifications}</p>
        )}
      </div>
      {showOperation &&
        operation.groups.map((g) => (
          <section key={g.index} className="rounded border border-[var(--color-border)] p-3">
            <h3 className="font-bold">
              {text.batch(g.index + 1, format.day(g.date), g.items.length, stateLabel(g.state))}
            </h3>
            {g.reason && (
              <p role="alert">{volunteerErrorMessage({ reason: g.reason }, 409, language)}</p>
            )}
            <ul>
              {g.items.map((i) => (
                <li key={i.item_key} className="border-b border-[var(--color-border)] py-3">
                  <p className="font-medium">
                    {i.starts_at ? format.sessionTime(i.starts_at) : format.day(i.date)} ·{" "}
                    {i.title ?? policyName(i)}
                  </p>
                  <p className="text-sm">
                    {text.policy(policyName(i), stateLabel(i.state), i.approved)}
                  </p>
                  <p className="text-sm">{text.capacity(i.capacity, i.preview.after?.capacity)}</p>
                  {i.preview.after && (
                    <p className="text-sm">
                      {text.after(
                        i.preview.after.title,
                        format.sessionTime(i.preview.after.starts_at),
                        common.shelterKey(i.preview.after.shelter_key),
                        i.preview.after.capacity,
                      )}
                    </p>
                  )}
                  {i.preview.reason && (
                    <p role="alert">{volunteerErrorMessage(i.preview, 422, language)}</p>
                  )}
                  {i.preview.issues?.length ? (
                    <p role="alert">
                      {i.preview.issues
                        .map((reason) => volunteerErrorMessage({ reason }, 422, language))
                        .join(text.issueSeparator)}
                    </p>
                  ) : null}
                  {i.preview.registrations && (
                    <p className="text-sm">
                      {text.attendanceEffect(
                        i.preview.registrations.filter((r) => r.kind === "applied").length,
                        i.preview.registrations.filter((r) => r.kind === "skipped").length,
                      )}
                    </p>
                  )}
                  <details className="text-sm">
                    <summary className="cursor-pointer">{text.itemTechnical}</summary>
                    <p>
                      {text.itemTechnicalText(
                        i.item_key,
                        i.template_key,
                        i.policy_version_id ?? null,
                      )}
                    </p>
                    {i.result && <p>{text.transaction(stateLabel(i.result.kind))}</p>}
                  </details>
                </li>
              ))}
            </ul>
            {["pending", "failed"].includes(g.state) && (
              <div className="mt-3 flex flex-wrap gap-3">
                <label>
                  <input
                    type="checkbox"
                    checked={reviewed.includes(g.index)}
                    onChange={(e) => onReview(g.index, e.target.checked)}
                  />
                  {text.reviewedBatch}
                </label>
                <button
                  className={button}
                  disabled={!reviewed.includes(g.index) || applyPending || sequencePending}
                  onClick={() => onApply(g.index)}
                >
                  {g.state === "failed" ? text.retry : text.runBatch}
                </button>
              </div>
            )}
          </section>
        ))}
    </section>
  );
}
