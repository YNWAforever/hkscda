import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { StatusPill } from "../StatusBadge";
import { activityAttendanceCopy } from "./activityAttendanceCopy";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import type {
  AttendanceController,
  AttendanceRecoveryState,
} from "../../../lib/volunteers/bulk/attendanceRecovery";

/** A receipt belongs to the operation, so it stays readable without a current roster. */
export function ActivityAttendanceRecovery({
  state,
  controller,
  actorUserId,
  onClearOperation,
  onOpenOriginal,
  selectedActivityId,
  selectedPage,
}: {
  state: AttendanceRecoveryState;
  controller: AttendanceController;
  actorUserId: string;
  onClearOperation: () => void;
  onOpenOriginal?: () => void;
  selectedActivityId?: string;
  selectedPage?: number;
}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(activityAttendanceCopy, language);
  const common = pickAdminCopy(volunteerCommonCopy, language);
  if (
    !actorUserId ||
    state.actorUserId !== actorUserId ||
    (!state.operationId && !state.previewKey)
  )
    return null;
  const operation = state.operation;
  const saved = operation?.results?.filter((row) => row.kind === "applied").length ?? 0;
  const label = (value: string) =>
    common.attendance[value as keyof typeof common.attendance] ??
    copy.reasons.invalid_attendance_status;
  const button =
    "min-h-11 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";
  return (
    <section
      className="min-w-0 space-y-3 rounded border border-[var(--color-border)] p-3"
      aria-label={copy.title}
    >
      {operation && (
        <div className="min-w-0 space-y-1">
          <p className="font-semibold break-words">
            {copy.originalSession(operation.activity_title)}
          </p>
          <p>{copy.originalPage(operation.scope.page)}</p>
          {selectedActivityId &&
            (selectedActivityId !== operation.activity_id ||
              selectedPage !== operation.scope.page) && <p role="status">{copy.differentScope}</p>}
        </div>
      )}
      {state.phase === "saved_refresh_failed" ? (
        <p role="alert">{saved ? copy.refreshFailed : copy.resultRefreshFailed}</p>
      ) : (
        <p role="status">
          {operation?.results
            ? copy.resultsTitle
            : state.applyIntent
              ? copy.unknown
              : copy.previewUnknown}
        </p>
      )}
      {state.problem && <p role="alert">{copy.problems[state.problem]}</p>}
      {operation?.results && (
        <>
          <h3 tabIndex={-1} className="font-semibold">
            {copy.resultsTitle}
          </h3>
          <p role="status">
            {saved ? copy.summary(saved, operation.results.length - saved) : copy.noSaved}
          </p>
          <ul className="space-y-3">
            {operation.rows.map((row, index) => {
              const result = operation.results![index];
              return (
                <li
                  key={row.registration_id}
                  className="min-w-0 space-y-1 rounded border border-[var(--color-border)] p-3"
                >
                  <p className="font-semibold break-words">{row.contact_name}</p>
                  <p className="break-all">{copy.reference(row.registration_id)}</p>
                  <p>{copy.participants(row.participant_count)}</p>
                  <p>
                    {copy.original}: {label(row.before.attendance_status)}
                  </p>
                  <p>
                    {copy.target}: {label(row.target.attendance_status)}
                  </p>
                  {row.target.reason && (
                    <p className="break-words">
                      {copy.reason}: {row.target.reason}
                    </p>
                  )}
                  {result.after && (
                    <p>
                      {copy.savedAttendance}: {label(result.after.attendance_status)}
                    </p>
                  )}
                  {result.kind !== "applied" && result.current && (
                    <p>
                      {copy.observedAttendance}: {label(result.current.attendance_status)}
                    </p>
                  )}
                  <StatusPill
                    tone={
                      result.kind === "applied"
                        ? "success"
                        : result.kind === "skipped"
                          ? "neutral"
                          : "danger"
                    }
                  >
                    {copy.outcomes[result.kind]}
                  </StatusPill>
                  {result.reason && <p>{copy.reasons[result.reason]}</p>}
                </li>
              );
            })}
          </ul>
        </>
      )}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={button}
          onClick={() => void controller.recover(actorUserId)}
        >
          {copy.recover}
        </button>
        {operation && onOpenOriginal && (
          <button type="button" className={button} onClick={onOpenOriginal}>
            {copy.openOriginal}
          </button>
        )}
        {state.phase === "saved_refresh_failed" && (
          <button type="button" className={button} onClick={() => void controller.retryRefresh()}>
            {copy.retryRefresh}
          </button>
        )}
        {state.phase === "outcome_unknown" && !state.applyIntent && (
          <button
            type="button"
            className={button}
            onClick={() => {
              controller.cancelPreview(actorUserId);
              onClearOperation();
            }}
          >
            {copy.cancel}
          </button>
        )}
      </div>
      {operation && (
        <details>
          <summary>{copy.technical}</summary>
          <p className="break-all">{operation.id}</p>
        </details>
      )}
    </section>
  );
}
