import { useEffect, useRef, useState } from "react";
import type { ActivityDetail } from "./activityWorkspaceTypes";
import type {
  AttendanceController,
  AttendanceRecoveryState,
} from "../../../lib/volunteers/bulk/attendanceRecovery";
import type { AttendanceTarget } from "../../../lib/volunteers/bulk/attendance";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { StatusPill } from "../StatusBadge";
import { volunteerRegistrationStatusLabelsFor } from "../../../lib/volunteers/labels";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { activityAttendanceCopy } from "./activityAttendanceCopy";
import { VolunteerLink } from "./VolunteerLink";
import { buildPendingRegistrationHref, type ActivityReturnState } from "./activityReturnState";

const control =
  "min-h-11 min-w-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm disabled:opacity-50";
type Row = ActivityDetail["registrations"][number];
export function ActivityAttendancePanel({
  detail,
  page,
  actorUserId,
  state,
  controller,
  refreshing,
  onReload,
  onClearOperation,
  onOpenOriginal,
  returnState,
  onRegistrationOpen,
}: {
  detail: ActivityDetail;
  page: number;
  actorUserId: string;
  state: AttendanceRecoveryState;
  controller: AttendanceController;
  refreshing: boolean;
  onReload: () => Promise<unknown>;
  onClearOperation: () => void;
  onOpenOriginal?: () => void;
  returnState?: ActivityReturnState;
  onRegistrationOpen?: (id: string) => void;
}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(activityAttendanceCopy, language),
    common = pickAdminCopy(volunteerCommonCopy, language);
  const registrationLabels: Record<string, string> = volunteerRegistrationStatusLabelsFor(language);
  const [drafts, setDrafts] = useState<Record<string, AttendanceTarget>>({});
  const [reviewed, setReviewed] = useState(false),
    [stale, setStale] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const scope = JSON.stringify([detail.activity.id, page, actorUserId]);
  const fingerprint = JSON.stringify(
    detail.registrations.map((row) => [row.id, row.updated_at, row.status, row.attendance_status]),
  );
  const previous = useRef({ scope, fingerprint });
  const operation =
    state.operation?.activity_id === detail.activity.id && state.operation.scope.page === page
      ? state.operation
      : null;
  const locked =
    refreshing ||
    !actorUserId ||
    ["previewing", "applying", "outcome_unknown"].includes(state.phase) ||
    (state.applyIntent &&
      state.operation?.state !== "completed" &&
      state.operation?.state !== "expired");
  const selected = Object.values(drafts);
  function discardKnownPreview() {
    controller.cancelPreview(actorUserId);
    if (
      controller.getState().phase === "draft" &&
      controller.getState().actorUserId === actorUserId
    )
      onClearOperation();
  }
  useEffect(() => {
    if (previous.current.scope !== scope) {
      setDrafts({});
      setReviewed(false);
      setStale(false);
      if (state.phase === "previewed" && !state.applyIntent) discardKnownPreview();
    } else if (previous.current.fingerprint !== fingerprint && Object.keys(drafts).length) {
      if (state.phase === "previewed" && !state.applyIntent) discardKnownPreview();
      setStale(true);
      setReviewed(false);
    }
    previous.current = { scope, fingerprint };
    // Scope/version changes invalidate a review. Receipt and unknown-operation state stay in the controller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scope, fingerprint]);
  useEffect(() => {
    setReviewed(false);
    if (
      operation &&
      (state.phase === "previewed" ||
        state.phase === "results" ||
        state.phase === "saved_refresh_failed")
    )
      heading.current?.focus();
  }, [operation, state.phase]);
  useEffect(() => {
    if (operation?.results) {
      const applied = new Set(
        operation.results.filter((row) => row.kind === "applied").map((row) => row.registration_id),
      );
      setDrafts((current) =>
        Object.fromEntries(Object.entries(current).filter(([id]) => !applied.has(id))),
      );
    }
  }, [operation?.results]);
  const reference = (id: string) => {
    const short = id.slice(0, 8);
    return detail.registrations.some((row) => row.id !== id && row.id.slice(0, 8) === short)
      ? id
      : short;
  };
  const defaultTarget = (row: Row): AttendanceTarget => ({
    registration_id: row.id,
    expected_updated_at: row.updated_at!,
    attendance_status:
      row.attendance_actions?.find((action) => action.command === "record" && action.allowed)
        ?.attendance_status ?? "attended",
    command: "record",
  });
  function patch(row: Row, value: Partial<AttendanceTarget>) {
    if (locked) return;
    if (state.phase === "previewed") discardKnownPreview();
    setReviewed(false);
    setDrafts((current) => ({
      ...current,
      [row.id]: { ...(current[row.id] ?? defaultTarget(row)), ...value },
    }));
  }
  async function reload() {
    try {
      await onReload();
      setDrafts({});
      setStale(false);
      setReviewed(false);
      if (state.phase === "previewed" && !state.applyIntent) discardKnownPreview();
    } catch {
      setStale(true);
    }
  }
  async function preview() {
    if (
      locked ||
      stale ||
      !selected.length ||
      selected.some((row) => row.command === "correct" && !row.reason?.trim())
    )
      return;
    await controller.preview(
      {
        action: "attendance_preview",
        activity_id: detail.activity.id,
        expected_activity_updated_at: detail.activity.updated_at,
        page,
        page_size: 25,
        entries: selected.map(({ reason, ...target }) => ({
          ...target,
          ...(reason?.trim() ? { reason: reason.trim() } : {}),
        })),
        idempotency_key: crypto.randomUUID(),
      },
      actorUserId,
    );
  }
  function reviewFailed() {
    if (!operation?.results || refreshing) return;
    const failed = new Set(
      operation.results.filter((row) => row.kind !== "applied").map((row) => row.registration_id),
    );
    const targets = Object.fromEntries(
      detail.registrations
        .filter((row) => failed.has(row.id))
        .map((row) => {
          const previousTarget = operation.rows.find(
            (item) => item.registration_id === row.id,
          )?.target;
          return [
            row.id,
            { ...defaultTarget(row), ...previousTarget, expected_updated_at: row.updated_at! },
          ];
        }),
    );
    discardKnownPreview();
    setDrafts(targets);
    setStale(false);
  }
  if (
    detail.attendance_contract !== 1 ||
    !detail.asOf ||
    detail.registrations.some(
      (row) => !row.updated_at || !row.participant_count || !row.attendance_actions,
    )
  )
    return <p>{copy.legacy}</p>;
  if (!actorUserId || (state.actorUserId && state.actorUserId !== actorUserId))
    return <p role="status">{copy.loading}</p>;
  const label = (status: string) =>
    common.attendance[status as keyof typeof common.attendance] ??
    copy.reasons.invalid_attendance_status;
  const saved = operation?.results?.filter((row) => row.kind === "applied").length ?? 0;
  return (
    <section data-attendance-panel className="min-w-0 space-y-4" aria-label={copy.title}>
      <h3 className="text-lg font-semibold">{copy.title}</h3>
      <p className="text-sm">{copy.scope}</p>
      {state.problem && <p role="alert">{copy.problems[state.problem]}</p>}
      {state.phase === "saved_refresh_failed" && (
        <p role="alert">{saved ? copy.refreshFailed : copy.resultRefreshFailed}</p>
      )}
      {["previewing", "applying"].includes(state.phase) && <p role="status">{copy.loading}</p>}
      {state.phase === "outcome_unknown" && (
        <p role="alert">{state.applyIntent ? copy.unknown : copy.previewUnknown}</p>
      )}
      {state.phase === "outcome_unknown" && !state.applyIntent && (
        <button type="button" className={control} onClick={discardKnownPreview}>
          {copy.cancel}
        </button>
      )}
      {state.operation && !operation && onOpenOriginal && (
        <button type="button" className={control} onClick={onOpenOriginal}>
          {copy.openOriginal}
        </button>
      )}
      {operation?.state === "expired" && <p role="alert">{copy.expired}</p>}
      {(state.operationId || state.previewKey) && (
        <button
          type="button"
          className={control}
          onClick={() => void controller.recover(actorUserId)}
        >
          {copy.recover}
        </button>
      )}
      {state.phase === "saved_refresh_failed" && (
        <button type="button" className={control} onClick={() => void controller.retryRefresh()}>
          {copy.retryRefresh}
        </button>
      )}
      {stale && <p role="alert">{copy.stale}</p>}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={control}
          disabled={locked || !detail.registrations.length}
          onClick={() => {
            if (state.phase === "previewed") discardKnownPreview();
            setDrafts(
              Object.fromEntries(
                detail.registrations.map((row) => [row.id, drafts[row.id] ?? defaultTarget(row)]),
              ),
            );
          }}
        >
          {copy.selectPage(detail.registrations.length)}
        </button>
        <button
          type="button"
          className={control}
          disabled={locked}
          onClick={() => {
            discardKnownPreview();
            setDrafts({});
          }}
        >
          {copy.clear}
        </button>
        <button
          type="button"
          className={control}
          disabled={["applying", "previewing"].includes(state.phase)}
          onClick={() => void reload()}
        >
          {copy.reload}
        </button>
      </div>
      {!detail.registrations.length && <p>{copy.empty}</p>}
      {detail.registrations.map((row) => {
        const draft = drafts[row.id] ?? defaultTarget(row);
        const eligibility = row.attendance_actions?.find(
          (action) =>
            action.command === draft.command &&
            action.attendance_status === draft.attendance_status,
        );
        const statuses =
          draft.command === "correct"
            ? (["not_marked", "attended", "completed", "no_show"] as const)
            : (["attended", "completed", "no_show"] as const);
        return (
          <article
            id={`registration-${row.id}`}
            tabIndex={-1}
            key={row.id}
            className="min-w-0 space-y-2 rounded border border-[var(--color-border)] p-3"
          >
            <label className="flex min-h-11 items-center gap-2 font-semibold break-words">
              <input
                type="checkbox"
                checked={Boolean(drafts[row.id])}
                disabled={locked}
                aria-label={copy.selectPerson(row.contact_name, reference(row.id))}
                onChange={(event) => {
                  if (event.target.checked) patch(row, {});
                  else {
                    if (state.phase === "previewed") discardKnownPreview();
                    setDrafts((current) =>
                      Object.fromEntries(Object.entries(current).filter(([id]) => id !== row.id)),
                    );
                  }
                }}
              />
              {row.contact_name}
            </label>
            <p className="break-all text-sm">{copy.reference(reference(row.id))}</p>
            <p>{copy.participants(row.participant_count!)}</p>
            {locked ? (
              <span aria-disabled="true">{copy.details}</span>
            ) : (
              <VolunteerLink
                className="inline-flex min-h-11 items-center underline"
                href={buildPendingRegistrationHref(row.id, returnState)}
                onClick={() => onRegistrationOpen?.(row.id)}
              >
                {copy.details}
              </VolunteerLink>
            )}
            <div className="flex flex-wrap gap-2">
              <StatusPill>
                {registrationLabels[row.status] ?? copy.unknownStatus(row.status)}
              </StatusPill>
              <StatusPill>{label(row.attendance_status)}</StatusPill>
            </div>
            <label className="block min-w-0">
              {copy.target}
              <select
                className={control + " block w-full"}
                value={draft.attendance_status}
                disabled={
                  locked ||
                  !row.attendance_actions?.some(
                    (action) => action.command === draft.command && action.allowed,
                  )
                }
                onChange={(event) =>
                  patch(row, {
                    attendance_status: event.target.value as AttendanceTarget["attendance_status"],
                  })
                }
              >
                {statuses.map((status) => (
                  <option
                    key={status}
                    value={status}
                    disabled={
                      !row.attendance_actions?.some(
                        (action) =>
                          action.command === draft.command &&
                          action.attendance_status === status &&
                          action.allowed,
                      )
                    }
                  >
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>
            {row.attendance_status !== "not_marked" && (
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={draft.command === "correct"}
                  disabled={locked}
                  onChange={(event) =>
                    patch(row, { command: event.target.checked ? "correct" : "record" })
                  }
                />
                {copy.correct}
              </label>
            )}
            {draft.command === "correct" && (
              <label className="block">
                {copy.reason}
                <textarea
                  className={control + " block min-h-20 w-full"}
                  required
                  maxLength={1000}
                  value={draft.reason ?? ""}
                  disabled={locked}
                  onChange={(event) => patch(row, { reason: event.target.value })}
                />
              </label>
            )}
            {!eligibility?.allowed && (
              <p className="text-sm">
                {copy.reasons[eligibility?.reason ?? "invalid_attendance_status"]}
              </p>
            )}
          </article>
        );
      })}
      <p role="status">{copy.selected(selected.length)}</p>
      <button
        type="button"
        className={control}
        disabled={
          locked ||
          stale ||
          !selected.length ||
          selected.some((row) => row.command === "correct" && !row.reason?.trim())
        }
        onClick={() => void preview()}
      >
        {copy.preview}
      </button>
      {operation && (
        <section className="min-w-0 space-y-3">
          <h4 ref={heading} tabIndex={-1} className="font-semibold">
            {operation.results ? copy.resultsTitle : copy.previewTitle}
          </h4>
          {operation.results && (
            <p role="status">
              {saved ? copy.summary(saved, operation.results.length - saved) : copy.noSaved}
            </p>
          )}
          <ul className="space-y-3">
            {operation.rows.map((row, index) => {
              const result = operation.results?.[index];
              return (
                <li
                  key={row.registration_id}
                  className="min-w-0 rounded border border-[var(--color-border)] p-3"
                >
                  <p className="font-semibold break-words">{row.contact_name}</p>
                  <p className="break-all text-sm">{copy.reference(row.registration_id)}</p>
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
                  {result?.after && (
                    <p>
                      {copy.savedAttendance}: {label(result.after.attendance_status)}
                    </p>
                  )}
                  {result && result.kind !== "applied" && result.current && (
                    <p>
                      {copy.observedAttendance}: {label(result.current.attendance_status)}
                    </p>
                  )}
                  <StatusPill
                    tone={
                      result?.kind === "applied"
                        ? "success"
                        : result?.kind === "failed" || result?.kind === "conflicted"
                          ? "danger"
                          : "neutral"
                    }
                  >
                    {result
                      ? copy.outcomes[result.kind]
                      : row.decision === "ready"
                        ? copy.ready
                        : copy.outcomes[row.decision]}
                  </StatusPill>
                  {(result?.reason ?? row.reason) && (
                    <p>{copy.reasons[(result?.reason ?? row.reason)!]}</p>
                  )}
                </li>
              );
            })}
          </ul>
          {!operation.results && (
            <div className="sticky bottom-0 space-y-2 border-t border-[var(--color-border)] bg-[var(--color-surface)] p-3">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={reviewed}
                  disabled={
                    refreshing || state.phase !== "previewed" || operation.state !== "previewed"
                  }
                  onChange={(event) => setReviewed(event.target.checked)}
                />
                {copy.reviewed}
              </label>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={control}
                  disabled={
                    !reviewed ||
                    refreshing ||
                    (stale && !state.applyIntent) ||
                    state.phase !== "previewed" ||
                    operation.state !== "previewed" ||
                    state.problem === "idempotency_mismatch" ||
                    !operation.rows.some((row) => row.decision === "ready")
                  }
                  onClick={() => void controller.apply(actorUserId, operation.id)}
                >
                  {copy.confirm}
                </button>
                <button
                  type="button"
                  className={control}
                  disabled={
                    state.phase === "applying" ||
                    (state.applyIntent && operation.state !== "expired")
                  }
                  onClick={discardKnownPreview}
                >
                  {copy.cancel}
                </button>
              </div>
            </div>
          )}
          {operation.results?.some((row) => row.kind !== "applied") && (
            <button
              type="button"
              className={control}
              disabled={refreshing || state.phase === "saved_refresh_failed"}
              onClick={reviewFailed}
            >
              {copy.retryFailed}
            </button>
          )}
          <details>
            <summary>{copy.technical}</summary>
            <p className="break-all">{operation.id}</p>
          </details>
        </section>
      )}
    </section>
  );
}
