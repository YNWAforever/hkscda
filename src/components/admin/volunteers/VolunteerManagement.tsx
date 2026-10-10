import { volunteerActionEligibility } from "../../../lib/volunteers/actionEligibility";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronDown, Copy, Plus, RefreshCw, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import {
  volunteerRegistrationStatusLabel,
  volunteerRegistrationStatusLabelsFor,
} from "../../../lib/volunteers/labels";
import type {
  VolunteerActivitySummary,
  VolunteerAttendanceStatus,
  VolunteerRegistrationStatus,
  VolunteerRegistrationSummary,
} from "../../../lib/volunteers/types";
import { useAdminLanguage } from "../adminI18n";
import { DataTable, type DataTableColumn } from "../DataTable";
import { pickAdminCopy } from "../i18n/copy";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { StatusPill, type StatusTone } from "../StatusBadge";
import { StatFigure } from "../LoadFailure";
import { TablePager } from "../TablePager";
import { ActivityCreateForm } from "./ActivityCreateForm";
import { EMPTY_ACTIVITY_DRAFT, type ActivityDraft } from "./activityDraft";
import {
  availableRegistrationTransitions,
  buildActivitySearchParams,
  buildRegistrationSearchParams,
  isDestructiveTransition,
  summarizeActivityCapacity,
  VOLUNTEER_ADMIN_PAGE_SIZE,
  volunteerStatusTone,
} from "./volunteerAdminLogic";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
import { volunteerRegistrationCopy } from "./volunteerRegistrationCopy";

type ActivityListResponse = {
  activities: VolunteerActivitySummary[];
  total: number;
};

type RegistrationRow = VolunteerRegistrationSummary & {
  activity?: VolunteerActivitySummary;
};

type RegistrationListResponse = {
  registrations: RegistrationRow[];
  total: number;
};

function toIsoFromLocal(value: string) {
  return new Date(value + ":00+08:00").toISOString();
}

const REGISTRATION_TONES = {
  success: "success",
  warning: "warning",
  danger: "danger",
  default: "neutral",
} as const satisfies Record<ReturnType<typeof volunteerStatusTone>, StatusTone>;

function registrationTone(status: VolunteerRegistrationStatus): StatusTone {
  return REGISTRATION_TONES[volunteerStatusTone(status)];
}

const inputClass =
  "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

const buttonBase =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold " +
  "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

function StatCard({
  icon,
  label,
  value,
  emphasis,
  failed = false,
  loading = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  emphasis?: boolean;
  /** The query behind this figure failed. Renders "—", never 0. */
  failed?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-4 ${
        emphasis
          ? "border-[var(--color-primary)] bg-[var(--color-primary-highlight)]"
          : "border-[var(--color-border)] bg-[var(--color-surface)]"
      }`}
    >
      <span className="text-[var(--color-primary)]" aria-hidden="true">
        {icon}
      </span>
      <div>
        <p className="text-2xl font-bold tabular-nums text-[var(--color-panel)]">
          <StatFigure value={value} failed={failed} loading={loading} />
        </p>
        <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      </div>
    </div>
  );
}

export function VolunteerManagement() {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerRegistrationCopy, language);
  const text = copy.management;
  const common = pickAdminCopy(volunteerCommonCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const queryClient = useQueryClient();
  const [activityQuery, setActivityQuery] = useState("");
  const [registrationQuery, setRegistrationQuery] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState<VolunteerRegistrationStatus | "all">(
    () =>
      typeof window !== "undefined" &&
      new URLSearchParams(window.location.search).get("registration_status") === "pending"
        ? "pending"
        : "all",
  );
  const [attendanceStatus, setAttendanceStatus] = useState<VolunteerAttendanceStatus | "all">(
    "all",
  );
  // The link between the two tables: picking an activity scopes the roster
  // below it, which is how you answer "who signed up for this event".
  const [activityFilter, setActivityFilter] = useState<VolunteerActivitySummary | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<{
    id: string;
    contactName: string;
    status: VolunteerRegistrationStatus;
    expectedUpdatedAt: string;
  } | null>(null);
  const [activityPage, setActivityPage] = useState(1);
  const [registrationPage, setRegistrationPage] = useState(1);

  const [draft, setDraft] = useState<ActivityDraft>(EMPTY_ACTIVITY_DRAFT);

  const activitySearch = useMemo(
    () =>
      buildActivitySearchParams({
        q: activityQuery,
        status: "all",
        type: "all",
        page: activityPage,
      }).toString(),
    [activityQuery, activityPage],
  );
  const registrationSearch = useMemo(
    () =>
      buildRegistrationSearchParams({
        q: registrationQuery,
        status: registrationStatus,
        attendanceStatus,
        activityId: activityFilter?.id ?? "",
        page: registrationPage,
      }).toString(),
    [registrationQuery, registrationStatus, attendanceStatus, activityFilter, registrationPage],
  );

  // Any change to a filter invalidates the current page number: staying on
  // page 3 of a freshly narrowed result set shows an empty table that looks
  // like "no matches".
  function applyRegistrationFilter(change: () => void) {
    change();
    setRegistrationPage(1);
  }

  const activitiesQuery = useQuery({
    queryKey: ["volunteer-activities", activitySearch],
    queryFn: () =>
      fetchAdminJson<ActivityListResponse>(`/api/admin/volunteers/activities?${activitySearch}`),
  });
  const registrationsQuery = useQuery({
    queryKey: ["volunteer-registrations", registrationSearch],
    queryFn: () =>
      fetchAdminJson<RegistrationListResponse>(
        `/api/admin/volunteers/registrations?${registrationSearch}`,
      ),
  });

  // A failed query also yields `data === undefined`, so these defaults are only
  // safe once the error is read separately. Without that, an outage renders as
  // an empty table and zero KPIs -- the audit symptom where this page showed no
  // records while the database held 12 activities and 5 registrations.
  const activitiesFailed = activitiesQuery.isError;
  const registrationsFailed = registrationsQuery.isError;
  const activities = activitiesQuery.data?.activities ?? [];
  const registrations = registrationsQuery.data?.registrations ?? [];

  const pendingCount = activities.reduce(
    (total, activity) => total + (activity.pendingParticipants ?? 0),
    0,
  );
  const upcomingCount = activities.filter(
    (activity) => activity.status === "published" && new Date(activity.startsAt) >= new Date(),
  ).length;

  const refreshAll = () => {
    void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] });
    void queryClient.invalidateQueries({ queryKey: ["volunteer-registrations"] });
  };

  const createActivity = useMutation({
    mutationFn: () =>
      fetchAdminJson<{ id: string }>("/api/admin/volunteers/activities", {
        method: "POST",
        body: JSON.stringify({
          type: draft.type,
          title: draft.title,
          description: null,
          startsAt: toIsoFromLocal(draft.startsAt),
          endsAt: draft.endsAt ? toIsoFromLocal(draft.endsAt) : null,
          location: draft.location,
          capacity: draft.capacity,
          minAge: draft.minAge,
          autoApprove: draft.autoApprove,
          allowWaitlist: true,
          status: "published",
          registrationModes: draft.allowGroups ? ["individual", "group"] : ["individual"],
        }),
      }),
    onSuccess: () => {
      setDraft((current) => ({ ...current, title: "", startsAt: "", endsAt: "", location: "" }));
      setShowCreate(false);
      void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] });
    },
  });

  const patchActivity = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      fetchAdminJson(`/api/admin/volunteers/activities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] }),
  });

  const cloneActivity = useMutation({
    mutationFn: (id: string) =>
      fetchAdminJson(`/api/admin/volunteers/activities/${id}/clone`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] }),
  });

  const updateRegistration = useMutation({
    mutationFn: ({
      id,
      status,
      expectedUpdatedAt,
    }: {
      id: string;
      status: VolunteerRegistrationStatus;
      expectedUpdatedAt: string;
    }) =>
      fetchAdminJson(`/api/admin/volunteers/registrations/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status, expectedUpdatedAt }),
      }),
    onSettled: refreshAll,
  });

  const completeAttendance = useMutation({
    mutationFn: ({ id, updatedAt }: Pick<VolunteerRegistrationSummary, "id" | "updatedAt">) =>
      fetchAdminJson(`/api/admin/volunteers/registrations/${id}/attendance`, {
        method: "PATCH",
        body: JSON.stringify({ attendanceStatus: "completed", expectedUpdatedAt: updatedAt }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["volunteer-registrations"] }),
  });

  const activityColumns: DataTableColumn<VolunteerActivitySummary>[] = [
    {
      id: "activity",
      header: text.activities.columns.activity,
      cell: (activity) => (
        <div>
          <p className="font-semibold text-[var(--color-panel)]">{activity.title}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {common.activityType[activity.type]} · {activity.location}
          </p>
        </div>
      ),
    },
    {
      id: "time",
      header: text.activities.columns.date,
      cell: (activity) => (
        <div className="text-sm">
          <p className="tabular-nums text-[var(--color-panel)]">
            {format.managementDateTime(activity.startsAt)}
          </p>
          {activity.endsAt ? (
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {text.activities.until(format.managementDateTime(activity.endsAt))}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "capacity",
      header: text.activities.columns.places,
      cell: (activity) => {
        const summary = summarizeActivityCapacity(activity);
        const full = summary.approved >= activity.capacity;
        return (
          <div className="text-sm">
            <p
              className={`font-semibold tabular-nums ${
                full ? "text-[var(--color-warning)]" : "text-[var(--color-panel)]"
              }`}
            >
              {format.number(summary.approved)} / {format.number(activity.capacity)}
            </p>
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {text.activities.pendingAndWaitlisted(
                activity.pendingParticipants ?? 0,
                summary.waitlisted,
              )}
            </p>
          </div>
        );
      },
    },
    {
      id: "status",
      header: text.activities.columns.status,
      cell: (activity) => (
        <span className="rounded-full bg-[var(--color-surface-offset)] px-2 py-1 text-xs font-bold text-[var(--color-panel)]">
          {common.activityStatus[activity.status]}
        </span>
      ),
    },
    {
      id: "actions",
      header: text.activities.columns.actions,
      cell: (activity) => {
        const selected = activityFilter?.id === activity.id;
        return (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() =>
                applyRegistrationFilter(() => setActivityFilter(selected ? null : activity))
              }
              aria-pressed={selected}
              className={`${buttonBase} ${
                selected
                  ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)]"
                  : "border border-[var(--color-border)] hover:bg-[var(--color-surface-offset)]"
              }`}
            >
              <Users className="h-3.5 w-3.5" />
              {selected ? text.activities.showing : text.activities.viewRegistrations}
            </button>
            <button
              type="button"
              disabled={patchActivity.isPending}
              onClick={() =>
                patchActivity.mutate({
                  id: activity.id,
                  body: {
                    status: activity.status === "published" ? "closed" : "published",
                    expectedUpdatedAt: activity.updatedAt,
                  },
                })
              }
              className={`${buttonBase} border border-[var(--color-border)] hover:bg-[var(--color-surface-offset)]`}
            >
              {activity.status === "published"
                ? text.activities.closeRegistration
                : text.activities.publish}
            </button>
            <button
              type="button"
              disabled={cloneActivity.isPending}
              onClick={() => cloneActivity.mutate(activity.id)}
              className={`${buttonBase} border border-[var(--color-border)] hover:bg-[var(--color-surface-offset)]`}
            >
              <Copy className="h-3.5 w-3.5" />
              {text.activities.duplicate}
            </button>
          </div>
        );
      },
    },
  ];

  const registrationColumns: DataTableColumn<RegistrationRow>[] = [
    {
      id: "name",
      header: text.registrations.columns.registrant,
      cell: (registration) => (
        <div className="min-w-48">
          <Link
            to="/admin/volunteers/registrations/$id"
            params={{ id: registration.id }}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            {registration.contactName}
          </Link>
          <p className="text-xs text-[var(--color-text-muted)]">{registration.contactEmail}</p>
          <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
            {registration.contactPhone}
          </p>
          {registration.organizationName ? (
            <p className="text-xs text-[var(--color-text-muted)]">
              {text.registrations.organisation(registration.organizationName)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "activity",
      header: text.registrations.columns.activity,
      cell: (registration) =>
        registration.activity ? (
          <div className="min-w-40 text-sm">
            <p className="font-medium text-[var(--color-panel)]">{registration.activity.title}</p>
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {format.managementDateTime(registration.activity.startsAt)}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {common.activityType[registration.activity.type]} · {registration.activity.location}
            </p>
          </div>
        ) : (
          // Never show a bare UUID: it tells the operator nothing.
          <span className="text-xs text-[var(--color-text-muted)]">
            {text.registrations.activityNotLoaded}
          </span>
        ),
    },
    {
      id: "people",
      header: text.registrations.columns.people,
      cell: (registration) => (
        <div className="text-sm">
          <p className="font-semibold tabular-nums text-[var(--color-panel)]">
            {text.registrations.peopleCount(registration.participantCount)}
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {common.registrationType[registration.registrationType]}
          </p>
          {registration.youngestAge !== null ? (
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {text.registrations.youngest(registration.youngestAge)}
            </p>
          ) : null}
          {registration.guardianName ? (
            <p className="text-xs text-[var(--color-warning)]">
              {text.registrations.guardianConsent}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "status",
      header: text.registrations.columns.status,
      cell: (registration) => (
        <div className="space-y-1">
          <StatusPill tone={registrationTone(registration.status)}>
            {volunteerRegistrationStatusLabel(registration.status, language)}
          </StatusPill>
          <p className="text-xs text-[var(--color-text-muted)]">
            {text.registrations.attendance(common.attendance[registration.attendanceStatus])}
          </p>
          <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
            {text.registrations.registeredOn(format.managementDate(registration.createdAt))}
          </p>
        </div>
      ),
    },
    {
      id: "actions",
      header: text.registrations.columns.actions,
      cell: (registration) => renderRegistrationActions(registration),
    },
  ];

  function renderRegistrationActions(registration: RegistrationRow) {
    {
      const transitions = availableRegistrationTransitions(registration.status);
      const attendable = registration.activity
        ? volunteerActionEligibility({
            status: registration.status,
            attendance_status: registration.attendanceStatus,
            starts_at: registration.activity.startsAt,
            ends_at: registration.activity.endsAt,
            activity_status: registration.activity.status,
          }).completed
        : false;

      if (transitions.length === 0 && !attendable) {
        return <span className="text-xs text-[var(--color-text-muted)]">{copy.nothingToDo}</span>;
      }

      return (
        <div className="flex min-w-44 flex-wrap gap-2">
          {transitions.map((status) => {
            const destructive = isDestructiveTransition(status);
            const primary = status === "approved";
            return (
              <button
                key={status}
                type="button"
                disabled={updateRegistration.isPending}
                onClick={() => {
                  if (destructive) {
                    setRejectTarget({
                      id: registration.id,
                      contactName: registration.contactName,
                      status,
                      expectedUpdatedAt: registration.updatedAt,
                    });
                    return;
                  }
                  updateRegistration.mutate({
                    id: registration.id,
                    status,
                    expectedUpdatedAt: registration.updatedAt,
                  });
                }}
                className={`${buttonBase} ${
                  primary
                    ? "bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:opacity-90"
                    : destructive
                      ? "border border-[var(--color-error)] text-[var(--color-error)] hover:bg-[var(--color-primary-highlight)]"
                      : "border border-[var(--color-border)] hover:bg-[var(--color-surface-offset)]"
                }`}
              >
                {copy.transitions[status]}
              </button>
            );
          })}
          {attendable ? (
            <button
              type="button"
              disabled={completeAttendance.isPending}
              onClick={() => completeAttendance.mutate(registration)}
              className={`${buttonBase} border border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success-highlight)]`}
            >
              {text.registrations.markCompleted}
            </button>
          ) : null}
        </div>
      );
    }
  }

  /**
   * Below `md` the five columns collapse into a card. The action column holds up
   * to four buttons; squeezed into a table cell on a phone they wrap into an
   * unreadable stack and fall under the 44px touch target. A card gives them a
   * full-width row of their own.
   */
  function renderRegistrationCard(registration: RegistrationRow) {
    return (
      <div className="space-y-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Link
              to="/admin/volunteers/registrations/$id"
              params={{ id: registration.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {registration.contactName}
            </Link>
            <p className="text-xs text-[var(--color-text-muted)]">{registration.contactEmail}</p>
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {registration.contactPhone}
            </p>
          </div>
          <StatusPill tone={registrationTone(registration.status)} className="shrink-0">
            {volunteerRegistrationStatusLabel(registration.status, language)}
          </StatusPill>
        </div>

        {registration.activity ? (
          <div className="rounded-md bg-[var(--color-surface-offset)] p-3 text-sm">
            <p className="font-medium text-[var(--color-panel)]">{registration.activity.title}</p>
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {format.managementDateTime(registration.activity.startsAt)} ·{" "}
              {registration.activity.location}
            </p>
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-[var(--color-text-muted)]">{text.registrations.cardPeople}</dt>
            <dd className="tabular-nums text-[var(--color-panel)]">
              {text.registrations.cardPeopleValue(
                registration.participantCount,
                common.registrationType[registration.registrationType],
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)]">{text.registrations.cardAttendance}</dt>
            <dd className="text-[var(--color-panel)]">
              {common.attendance[registration.attendanceStatus]}
            </dd>
          </div>
          {registration.organizationName ? (
            <div className="col-span-2">
              <dt className="text-[var(--color-text-muted)]">
                {text.registrations.cardOrganisation}
              </dt>
              <dd className="text-[var(--color-panel)]">{registration.organizationName}</dd>
            </div>
          ) : null}
          {registration.guardianName ? (
            <div className="col-span-2">
              <dt className="text-[var(--color-text-muted)]">{text.registrations.cardGuardian}</dt>
              <dd className="text-[var(--color-warning)]">
                {text.registrations.guardianValue(
                  registration.guardianName,
                  registration.guardianPhone,
                )}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="border-t border-[var(--color-border)] pt-3">
          {renderRegistrationActions(registration)}
        </div>
      </div>
    );
  }

  // A failed rejection is shown inside its confirm dialog, not twice.
  const registrationFailure =
    updateRegistration.variables?.status === "rejected" ? null : updateRegistration.error;
  const changeFailure = patchActivity.error ?? registrationFailure;

  return (
    <div className="space-y-6 p-6">
      <ConfirmActionDialog
        open={rejectTarget !== null}
        onOpenChange={(open) => {
          if (!open) setRejectTarget(null);
        }}
        title={copy.rejectVerb}
        consequence={text.registrations.confirmReject(rejectTarget?.contactName ?? "")}
        confirmLabel={copy.rejectVerb}
        destructive
        reason="none"
        onConfirm={async () => {
          if (!rejectTarget) return;
          await updateRegistration.mutateAsync({
            id: rejectTarget.id,
            status: rejectTarget.status,
            expectedUpdatedAt: rejectTarget.expectedUpdatedAt,
          });
        }}
      />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">{text.title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{text.intro}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshAll}
            className={`${buttonBase} min-h-11 border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-surface-offset)]`}
          >
            <RefreshCw className="h-4 w-4" />
            {text.refresh}
          </button>
          <button
            type="button"
            onClick={() => setShowCreate((open) => !open)}
            aria-expanded={showCreate}
            className={`${buttonBase} min-h-11 bg-[var(--color-primary)] px-3 text-sm text-[var(--color-primary-foreground)] hover:opacity-90`}
          >
            <Plus className="h-4 w-4" />
            {text.addActivity}
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-150 ${showCreate ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label={text.stats.pending}
          value={format.number(pendingCount)}
          emphasis={!activitiesFailed && pendingCount > 0}
          failed={activitiesFailed}
          loading={activitiesQuery.isLoading}
        />
        <StatCard
          icon={<CalendarClock className="h-5 w-5" />}
          label={text.stats.upcoming}
          value={format.number(upcomingCount)}
          failed={activitiesFailed}
          loading={activitiesQuery.isLoading}
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label={text.stats.shown}
          value={format.number(registrations.length)}
          failed={registrationsFailed}
          loading={registrationsQuery.isLoading}
        />
      </div>

      {/* Creating an activity is occasional; keeping the 9-field form open on
          every visit pushed the tables the operator actually came for below
          the fold. */}
      {changeFailure && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {volunteerAdminErrorMessage(changeFailure, language)}
        </p>
      )}
      {showCreate ? (
        <ActivityCreateForm
          draft={draft}
          onChange={(patch) => setDraft((current) => ({ ...current, ...patch }))}
          onSubmit={() => createActivity.mutate()}
          onCancel={() => setShowCreate(false)}
          pending={createActivity.isPending}
          failed={createActivity.isError}
        />
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--color-panel)]">{text.activities.title}</h2>
          <input
            value={activityQuery}
            onChange={(event) => {
              setActivityQuery(event.target.value);
              setActivityPage(1);
            }}
            placeholder={text.activities.searchPlaceholder}
            aria-label={text.activities.searchLabel}
            className={`${inputClass} max-w-64`}
          />
        </div>
        <DataTable
          columns={activityColumns}
          rows={activities}
          getRowKey={(activity) => activity.id}
          loading={activitiesQuery.isLoading}
          empty={text.activities.empty}
          error={activitiesQuery.error}
          onRetry={() => void activitiesQuery.refetch()}
        />
        <TablePager
          page={activityPage}
          pageSize={VOLUNTEER_ADMIN_PAGE_SIZE}
          // On failure `total` is undefined, which the pager already treats as
          // "unknown". Marking it busy additionally disables Next, so the
          // operator cannot page forward through a list that was never read.
          total={activitiesQuery.data?.total}
          onPageChange={setActivityPage}
          busy={activitiesQuery.isFetching || activitiesFailed}
          label={text.activities.pagerLabel}
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--color-panel)]">
            {text.registrations.title}
          </h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={registrationStatus}
              onChange={(event) =>
                applyRegistrationFilter(() =>
                  setRegistrationStatus(event.target.value as VolunteerRegistrationStatus | "all"),
                )
              }
              aria-label={text.registrations.statusFilter}
              className={`${inputClass} max-w-40`}
            >
              <option value="all">{text.registrations.allStatuses}</option>
              {Object.entries(volunteerRegistrationStatusLabelsFor(language)).map(
                ([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ),
              )}
            </select>
            <select
              value={attendanceStatus}
              onChange={(event) =>
                applyRegistrationFilter(() =>
                  setAttendanceStatus(event.target.value as VolunteerAttendanceStatus | "all"),
                )
              }
              aria-label={text.registrations.attendanceFilter}
              className={`${inputClass} max-w-40`}
            >
              <option value="all">{text.registrations.allAttendance}</option>
              {Object.entries(common.attendance).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <input
              value={registrationQuery}
              onChange={(event) =>
                applyRegistrationFilter(() => setRegistrationQuery(event.target.value))
              }
              placeholder={text.registrations.searchPlaceholder}
              aria-label={text.registrations.searchLabel}
              className={`${inputClass} max-w-56`}
            />
          </div>
        </div>

        {activityFilter ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-primary)] bg-[var(--color-primary-highlight)] px-3 py-2 text-sm">
            <span className="text-[var(--color-panel)]">
              {text.registrations.filterBannerBefore}
              <strong>{activityFilter.title}</strong>
              {text.registrations.filterBannerAfter(
                format.managementDateTime(activityFilter.startsAt),
              )}
            </span>
            <button
              type="button"
              onClick={() => applyRegistrationFilter(() => setActivityFilter(null))}
              className={`${buttonBase} border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-offset)]`}
            >
              <X className="h-3.5 w-3.5" />
              {text.registrations.clearFilter}
            </button>
          </div>
        ) : null}

        <DataTable
          columns={registrationColumns}
          rows={registrations}
          getRowKey={(registration) => registration.id}
          loading={registrationsQuery.isLoading}
          renderMobileCard={renderRegistrationCard}
          empty={
            activityFilter
              ? text.registrations.emptyForActivity(activityFilter.title)
              : text.registrations.empty
          }
          error={registrationsQuery.error}
          onRetry={() => void registrationsQuery.refetch()}
        />
        <TablePager
          page={registrationPage}
          pageSize={VOLUNTEER_ADMIN_PAGE_SIZE}
          total={registrationsQuery.data?.total}
          onPageChange={setRegistrationPage}
          busy={registrationsQuery.isFetching || registrationsFailed}
          label={text.registrations.pagerLabel}
        />
      </section>
    </div>
  );
}
