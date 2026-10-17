import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerActionEligibility } from "../../../lib/volunteers/actionEligibility";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { volunteerRegistrationStatusLabel } from "../../../lib/volunteers/labels";
import type {
  VolunteerRegistrationDetail as VolunteerRegistrationDetailType,
  VolunteerRegistrationStatus,
} from "../../../lib/volunteers/types";
import { useAdminLanguage } from "../adminI18n";
import { useBreadcrumbRecordName } from "../adminBreadcrumbRecord";
import { DestinationHeading } from "../DestinationHeading";
import { pickAdminCopy } from "../i18n/copy";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { requiredReasonDialog } from "../confirmActionState";
import { LoadFailure } from "../LoadFailure";
import {
  availableRegistrationTransitions,
  isDestructiveTransition,
  rejectionRequest,
} from "./volunteerAdminLogic";
import { sendRegistrationStatusChange } from "./registrationStatusChange";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
import { volunteerRegistrationCopy } from "./volunteerRegistrationCopy";
import { RegistrationReviewSummary } from "./RegistrationReviewSummary";
import {
  registrationReviewOutcome,
  type RegistrationReviewOutcome,
} from "./registrationReviewOutcome";
import { registrationReviewCopy } from "./registrationReviewCopy";
import { volunteerWorkspaceCopy } from "../volunteerWorkspaceCopy";
import {
  registrationRouterSearch,
  readRegistrationReturnState,
  type RegistrationReturnState,
} from "./registrationReturnState";
import { invalidateVolunteerQueries, volunteerQueryKeys } from "../../../lib/volunteers/queryKeys";

type RegistrationResponse = {
  registration: VolunteerRegistrationDetailType;
};

export function RegistrationProfileLink({ profileId }: { profileId?: string | null }) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerRegistrationCopy, language).detail;
  return (
    <a
      className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--color-primary)] underline"
      href={
        profileId
          ? `/admin/volunteers/people/${encodeURIComponent(profileId)}`
          : "/admin/volunteers/qualifications"
      }
    >
      {profileId ? copy.viewProfile : copy.profileNotLinked}
    </a>
  );
}

export function VolunteerRegistrationDetail({
  registrationId,
  returnState,
}: {
  registrationId: string;
  returnState?: RegistrationReturnState;
}) {
  const { copy: shared, language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerRegistrationCopy, language);
  const text = copy.detail;
  const reviewCopy = pickAdminCopy(registrationReviewCopy, language);
  const common = pickAdminCopy(volunteerCommonCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const queryClient = useQueryClient();
  const safeReturn =
    returnState ??
    readRegistrationReturnState(
      new URLSearchParams(typeof window === "undefined" ? "" : window.location.search),
    );
  const [correctionReason, setCorrectionReason] = useState("");
  const [isCorrection, setIsCorrection] = useState(false);
  const [rejectStatus, setRejectStatus] = useState<VolunteerRegistrationStatus | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [reviewOutcome, setReviewOutcome] = useState<RegistrationReviewOutcome | null>(null);
  const [reviewTargetStatus, setReviewTargetStatus] = useState<string | null>(null);
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: volunteerQueryKeys.key("registration", registrationId),
    queryFn: ({ signal }) =>
      fetchAdminJson<RegistrationResponse>(
        `/api/admin/volunteers/registrations/${registrationId}`,
        { signal },
      ),
  });
  useBreadcrumbRecordName(data?.registration?.contactName);
  async function reloadRegistration() {
    const result = await refetch();
    if (!result.error) {
      setRefreshFailed(false);
      if (reviewOutcome === "unknown" && reviewTargetStatus) {
        setReviewOutcome(
          result.data?.registration?.status === reviewTargetStatus ? "recovered" : "failed",
        );
      }
    }
  }
  // A registration belongs to the activities page; that is the heading until it loads.
  const destination = (
    <DestinationHeading
      label={pickAdminCopy(volunteerWorkspaceCopy, language).pages.activities.label}
    />
  );

  const correctionEnabled =
    isCorrection &&
    Boolean(data?.registration && data.registration.attendanceStatus !== "not_marked");

  const updateStatus = useMutation({
    onMutate: (variables: { status: string; reason?: string }) => {
      setReviewOutcome(null);
      setReviewTargetStatus(variables.status);
      setRefreshFailed(false);
    },
    mutationFn: ({ status, reason }: { status: string; reason?: string }) =>
      sendRegistrationStatusChange(
        registrationId,
        { status, expectedUpdatedAt: data?.registration.updatedAt, reason },
        language,
      ),
    onSettled: async (_data, error, variables: { status: string; reason?: string }) => {
      let refreshed = true;
      try {
        await invalidateVolunteerQueries(queryClient, "registration");
      } catch {
        refreshed = false;
      }
      const observedStatus = queryClient.getQueryData<RegistrationResponse>(
        volunteerQueryKeys.key("registration", registrationId),
      )?.registration?.status;
      const outcome = registrationReviewOutcome({
        error,
        refreshed,
        requestedStatus: variables.status,
        observedStatus,
      });
      setReviewOutcome(outcome);
      setRefreshFailed(outcome === "saved_refresh_failed");
    },
  });

  const updateAttendance = useMutation({
    mutationFn: (attendanceStatus: string) =>
      fetchAdminJson(`/api/admin/volunteers/registrations/${registrationId}/attendance`, {
        method: "PATCH",
        body: JSON.stringify({
          attendanceStatus,
          expectedUpdatedAt: data?.registration.updatedAt,
          command: correctionEnabled ? "correct" : "record",
          reason: correctionEnabled ? correctionReason : undefined,
        }),
      }),
    onSettled: async (_data, error) => {
      try {
        await invalidateVolunteerQueries(queryClient, "attendance");
        setRefreshFailed(false);
      } catch {
        if (!error) setRefreshFailed(true);
      }
    },
  });

  if (isLoading)
    return (
      <div className="space-y-3 p-6">
        {destination}
        <p className="text-sm text-[var(--color-text-muted)]">{shared.common.loading}</p>
      </div>
    );
  if (error) {
    return (
      <div className="space-y-3 p-6">
        {destination}
        {refreshFailed && <p role="alert">{common.savedRefreshFailed}</p>}
        <LoadFailure error={error} onRetry={() => void reloadRegistration()} />
      </div>
    );
  }
  if (!data?.registration) {
    return (
      <div className="space-y-3 p-6">
        {destination}
        <p className="text-sm text-[var(--color-primary)]">{text.notFound}</p>
      </div>
    );
  }

  const registration = data.registration;
  const statusActions = availableRegistrationTransitions(registration.status);
  const eligibility = volunteerActionEligibility({
    status: registration.status,
    attendance_status: registration.attendanceStatus,
    starts_at: registration.activity.startsAt,
    ends_at: registration.activity.endsAt,
    activity_status: registration.activity.status,
  });
  const ordinaryAttendanceActions = (["attended", "completed", "no_show"] as const).filter(
    (status) => eligibility[status],
  );
  const started = Date.parse(registration.activity.startsAt) <= Date.now();
  const ended =
    Date.parse(registration.activity.endsAt ?? registration.activity.startsAt) <= Date.now();
  const approved =
    registration.status === "approved" && registration.activity.status !== "cancelled";
  const correctionAttendanceActions = (
    ["not_marked", "attended", "completed", "no_show"] as const
  ).filter((status) => {
    if (status === registration.attendanceStatus) return false;
    if (status === "not_marked") return true;
    if (status === "no_show") return ended;
    return approved && (status === "attended" ? started : ended);
  });
  const attendanceActions = correctionEnabled
    ? correctionAttendanceActions
    : ordinaryAttendanceActions;
  const reviewActionsLocked =
    updateStatus.isPending || updateAttendance.isPending || reviewOutcome === "unknown";
  const activityTime = registration.activity.endsAt
    ? `${format.registrationDateTime(registration.activity.startsAt)} – ${format.registrationDateTime(registration.activity.endsAt)}`
    : format.registrationDateTime(registration.activity.startsAt);

  return (
    <div className="space-y-5 p-6">
      {refreshFailed && <p role="alert">{common.savedRefreshFailed}</p>}
      {/* required-reason: volunteer_registration.reject */}
      <ConfirmActionDialog
        open={rejectStatus !== null}
        onOpenChange={(open) => {
          if (!open) setRejectStatus(null);
        }}
        title={copy.rejectVerb}
        consequence={copy.confirmReject(registration.contactName)}
        confirmLabel={copy.rejectVerb}
        destructive
        reason={requiredReasonDialog}
        onConfirm={async (reason) => {
          const request = rejectionRequest(rejectStatus, reason);
          if (request) await updateStatus.mutateAsync(request);
        }}
      />
      <Link
        to={`/admin/volunteers/${safeReturn.from}`}
        search={registrationRouterSearch(safeReturn) as never}
        className="text-sm font-semibold text-[var(--color-primary)]"
      >
        {safeReturn.from === "tasks" ? text.backTasks : text.back}
      </Link>
      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-panel)]">
              {registration.contactName}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {registration.contactEmail} · {registration.contactPhone}
            </p>
          </div>
          <div className="text-right text-sm">
            <p className="font-bold text-[var(--color-panel)]">
              {volunteerRegistrationStatusLabel(registration.status, language)}
            </p>
            <p className="text-[var(--color-text-muted)]">
              {text.attendance(common.attendance[registration.attendanceStatus])}
            </p>
          </div>
        </div>

        <RegistrationProfileLink profileId={registration.profileId} />
        <div className="mt-5 grid gap-4 md:grid-cols-3">
          <DetailItem label={text.activity} value={registration.activity.title} />
          <DetailItem label={text.activityTime} value={activityTime} />
          <DetailItem label={text.location} value={registration.activity.location} />
          <DetailItem
            label={text.participants}
            value={format.number(registration.participantCount)}
          />
          <DetailItem
            label={text.type}
            value={common.registrationType[registration.registrationType]}
          />
          <DetailItem label={text.group} value={registration.organizationName ?? text.none} />
          <DetailItem
            label={text.age}
            value={String(registration.declaredAge ?? registration.youngestAge ?? text.none)}
          />
          <DetailItem
            label={text.responsibleAdult}
            value={registration.guardianName ?? text.none}
          />
          <DetailItem
            label={text.volunteerHours}
            value={String(registration.volunteerHours ?? text.none)}
          />
          <DetailItem label={text.notes} value={registration.notes ?? text.none} />
        </div>

        <RegistrationReviewSummary registration={registration} />
        <button
          className="mt-3 min-h-11 rounded-md border border-[var(--color-border)] px-3 text-sm"
          disabled={reviewActionsLocked}
          onClick={() => void reloadRegistration()}
        >
          {reviewCopy.reload}
        </button>
        {updateStatus.isPending && <p role="status">{text.reviewSubmitting}</p>}
        {(reviewOutcome === "saved" || updateStatus.isSuccess) && (
          <p role="status">{text.reviewSaved}</p>
        )}
        {reviewOutcome === "recovered" && <p role="status">{text.reviewRecovered}</p>}
        {reviewOutcome === "unknown" && <p role="alert">{text.reviewUnknown}</p>}
        {reviewOutcome === "failed" && !updateStatus.error && (
          <p role="alert">{text.reviewReloadedNotSaved}</p>
        )}
        {updateStatus.error &&
          updateStatus.variables?.status !== "rejected" &&
          reviewOutcome !== "unknown" &&
          reviewOutcome !== "recovered" && (
            <p role="alert" className="mt-4 text-sm text-[var(--color-error)]">
              {volunteerAdminErrorMessage(updateStatus.error, language)}
            </p>
          )}
        {updateAttendance.error && (
          <p role="alert" className="mt-4 text-sm text-[var(--color-error)]">
            {volunteerAdminErrorMessage(updateAttendance.error, language)}
          </p>
        )}
        {registration.attendanceStatus !== "not_marked" ? (
          <label className="mt-4 flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={isCorrection}
              onChange={(event) => setIsCorrection(event.target.checked)}
            />
            {text.correct}
          </label>
        ) : null}
        {correctionEnabled ? (
          <label className="mt-3 block text-sm">
            {text.correctionReason}
            <textarea
              value={correctionReason}
              onChange={(event) => setCorrectionReason(event.target.value)}
              maxLength={2000}
              required
              className="mt-1 block w-full rounded-md border border-[var(--color-border)] p-2"
            />
          </label>
        ) : null}
        <DetailItem
          label={text.placesLeft}
          value={format.number(registration.activity.remainingCapacity)}
        />
        <div className="mt-5 flex flex-wrap gap-2">
          {statusActions.map((status) => (
            <button
              key={status}
              type="button"
              disabled={reviewActionsLocked}
              onClick={() => {
                if (isDestructiveTransition(status)) {
                  setRejectStatus(status);
                  return;
                }
                updateStatus.mutate({ status });
              }}
              className={
                isDestructiveTransition(status)
                  ? "rounded-md border border-[var(--color-error)] px-3 py-2 text-sm font-medium text-[var(--color-error)]"
                  : "rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium"
              }
            >
              {copy.transitions[status]}
            </button>
          ))}
          {attendanceActions.map((attendanceStatus) => (
            <button
              key={attendanceStatus}
              type="button"
              disabled={
                reviewActionsLocked ||
                updateAttendance.isPending ||
                (correctionEnabled && !correctionReason.trim())
              }
              onClick={() => updateAttendance.mutate(attendanceStatus)}
              className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium"
            >
              {copy.attendanceActions[attendanceStatus]}
            </button>
          ))}
          {statusActions.length === 0 && attendanceActions.length === 0 ? (
            <span className="text-sm text-[var(--color-text-muted)]">{copy.nothingToDo}</span>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 text-sm font-semibold text-[var(--color-panel)]">{value}</p>
    </div>
  );
}
