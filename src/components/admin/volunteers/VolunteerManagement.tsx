import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { CalendarClock, ChevronDown, Copy, Plus, RefreshCw, Users, X } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  VolunteerActivitySummary,
  VolunteerActivityType,
  VolunteerAttendanceStatus,
  VolunteerRegistrationStatus,
  VolunteerRegistrationSummary,
} from "../../../lib/volunteers/types";
import { DataTable, type DataTableColumn } from "../DataTable";
import { TablePager } from "../TablePager";
import {
  activityStatusLabels,
  activityTypeLabels,
  attendanceStatusLabels,
  availableRegistrationTransitions,
  buildActivitySearchParams,
  buildRegistrationSearchParams,
  canMarkAttendance,
  isDestructiveTransition,
  registrationStatusLabels,
  registrationTypeLabels,
  summarizeActivityCapacity,
  VOLUNTEER_ADMIN_PAGE_SIZE,
  volunteerStatusTone,
} from "./volunteerAdminLogic";

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
  return new Date(value).toISOString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-HK", { dateStyle: "medium", timeStyle: "short" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("zh-HK", { dateStyle: "medium" });
}

function statusClass(status: VolunteerRegistrationStatus) {
  const tone = volunteerStatusTone(status);
  if (tone === "success") return "bg-[var(--color-success-highlight)] text-[var(--color-success)]";
  if (tone === "warning") return "bg-[var(--color-surface-offset)] text-[var(--color-warning)]";
  if (tone === "danger") return "bg-[var(--color-primary-highlight)] text-[var(--color-error)]";
  return "bg-[var(--color-surface-offset)] text-[var(--color-panel)]";
}

const inputClass =
  "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

const buttonBase =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold " +
  "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Labelled field wrapper — the old form relied on placeholders alone, and the
 *  two number inputs had neither placeholder nor label. */
function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--color-panel)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--color-text-muted)]">{hint}</span> : null}
    </label>
  );
}

function StatCard({
  icon,
  label,
  value,
  emphasis,
}: {
  icon: React.ReactNode;
  label: string;
  value: number | string;
  emphasis?: boolean;
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
        <p className="text-2xl font-bold tabular-nums text-[var(--color-panel)]">{value}</p>
        <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      </div>
    </div>
  );
}

export function VolunteerManagement() {
  const queryClient = useQueryClient();
  const [activityQuery, setActivityQuery] = useState("");
  const [registrationQuery, setRegistrationQuery] = useState("");
  const [registrationStatus, setRegistrationStatus] = useState<VolunteerRegistrationStatus | "all">(
    "all",
  );
  const [attendanceStatus, setAttendanceStatus] = useState<VolunteerAttendanceStatus | "all">(
    "all",
  );
  // The link between the two tables: picking an activity scopes the roster
  // below it, which is how you answer "who signed up for this event".
  const [activityFilter, setActivityFilter] = useState<VolunteerActivitySummary | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [activityPage, setActivityPage] = useState(1);
  const [registrationPage, setRegistrationPage] = useState(1);

  const [title, setTitle] = useState("");
  const [type, setType] = useState<VolunteerActivityType>("cleaning_day");
  const [startsAt, setStartsAt] = useState("");
  const [endsAt, setEndsAt] = useState("");
  const [location, setLocation] = useState("");
  const [capacity, setCapacity] = useState(12);
  const [minAge, setMinAge] = useState(16);
  const [autoApprove, setAutoApprove] = useState(false);
  const [allowGroups, setAllowGroups] = useState(true);

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
          type,
          title,
          description: null,
          startsAt: toIsoFromLocal(startsAt),
          endsAt: endsAt ? toIsoFromLocal(endsAt) : null,
          location,
          capacity,
          minAge,
          autoApprove,
          allowWaitlist: true,
          status: "published",
          registrationModes: allowGroups ? ["individual", "group"] : ["individual"],
        }),
      }),
    onSuccess: () => {
      setTitle("");
      setStartsAt("");
      setEndsAt("");
      setLocation("");
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
    mutationFn: (id: string) =>
      fetchAdminJson(`/api/admin/volunteers/registrations/${id}/attendance`, {
        method: "PATCH",
        body: JSON.stringify({ attendanceStatus: "completed" }),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["volunteer-registrations"] }),
  });

  const activityColumns: DataTableColumn<VolunteerActivitySummary>[] = [
    {
      id: "activity",
      header: "活動",
      cell: (activity) => (
        <div>
          <p className="font-semibold text-[var(--color-panel)]">{activity.title}</p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {activityTypeLabels[activity.type]} · {activity.location}
          </p>
        </div>
      ),
    },
    {
      id: "time",
      header: "日期",
      cell: (activity) => (
        <div className="text-sm">
          <p className="tabular-nums text-[var(--color-panel)]">
            {formatDateTime(activity.startsAt)}
          </p>
          {activity.endsAt ? (
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              至 {formatDateTime(activity.endsAt)}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "capacity",
      header: "名額",
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
              {summary.approved} / {activity.capacity}
            </p>
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              待審 {activity.pendingParticipants ?? 0} · 候補 {summary.waitlisted}
            </p>
          </div>
        );
      },
    },
    {
      id: "status",
      header: "狀態",
      cell: (activity) => (
        <span className="rounded-full bg-[var(--color-surface-offset)] px-2 py-1 text-xs font-bold text-[var(--color-panel)]">
          {activityStatusLabels[activity.status]}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
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
              {selected ? "顯示中" : "查看報名"}
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
              {activity.status === "published" ? "關閉報名" : "發布"}
            </button>
            <button
              type="button"
              disabled={cloneActivity.isPending}
              onClick={() => cloneActivity.mutate(activity.id)}
              className={`${buttonBase} border border-[var(--color-border)] hover:bg-[var(--color-surface-offset)]`}
            >
              <Copy className="h-3.5 w-3.5" />
              複製
            </button>
          </div>
        );
      },
    },
  ];

  const registrationColumns: DataTableColumn<RegistrationRow>[] = [
    {
      id: "name",
      header: "報名人",
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
              機構：{registration.organizationName}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "activity",
      header: "報名活動",
      cell: (registration) =>
        registration.activity ? (
          <div className="min-w-40 text-sm">
            <p className="font-medium text-[var(--color-panel)]">{registration.activity.title}</p>
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {formatDateTime(registration.activity.startsAt)}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {activityTypeLabels[registration.activity.type]} · {registration.activity.location}
            </p>
          </div>
        ) : (
          // Never show a bare UUID: it tells the operator nothing.
          <span className="text-xs text-[var(--color-text-muted)]">活動資料未載入</span>
        ),
    },
    {
      id: "people",
      header: "人數 / 形式",
      cell: (registration) => (
        <div className="text-sm">
          <p className="font-semibold tabular-nums text-[var(--color-panel)]">
            {registration.participantCount} 人
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            {registrationTypeLabels[registration.registrationType]}
          </p>
          {registration.youngestAge !== null ? (
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              最小 {registration.youngestAge} 歲
            </p>
          ) : null}
          {registration.guardianName ? (
            <p className="text-xs text-[var(--color-warning)]">需家長同意</p>
          ) : null}
        </div>
      ),
    },
    {
      id: "status",
      header: "狀態",
      cell: (registration) => (
        <div className="space-y-1">
          <span
            className={`inline-block rounded-full px-2 py-1 text-xs font-bold ${statusClass(registration.status)}`}
          >
            {registrationStatusLabels[registration.status]}
          </span>
          <p className="text-xs text-[var(--color-text-muted)]">
            出席：{attendanceStatusLabels[registration.attendanceStatus]}
          </p>
          <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
            {formatDate(registration.createdAt)} 報名
          </p>
        </div>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: (registration) => renderRegistrationActions(registration),
    },
  ];

  function renderRegistrationActions(registration: RegistrationRow) {
    {
      const transitions = availableRegistrationTransitions(registration.status);
      const attendable = canMarkAttendance(
        registration,
        registration.activity?.startsAt,
        () => new Date(),
      );

      if (transitions.length === 0 && !attendable) {
        return <span className="text-xs text-[var(--color-text-muted)]">無需處理</span>;
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
                  if (
                    destructive &&
                    !window.confirm(`確定拒絕 ${registration.contactName} 的報名？對方會收到通知。`)
                  ) {
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
                {registrationStatusLabels[status]}
              </button>
            );
          })}
          {attendable ? (
            <button
              type="button"
              disabled={completeAttendance.isPending}
              onClick={() => completeAttendance.mutate(registration.id)}
              className={`${buttonBase} border border-[var(--color-success)] text-[var(--color-success)] hover:bg-[var(--color-success-highlight)]`}
            >
              標記完成
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
          <span
            className={`shrink-0 rounded-full px-2 py-1 text-xs font-bold ${statusClass(registration.status)}`}
          >
            {registrationStatusLabels[registration.status]}
          </span>
        </div>

        {registration.activity ? (
          <div className="rounded-md bg-[var(--color-surface-offset)] p-3 text-sm">
            <p className="font-medium text-[var(--color-panel)]">{registration.activity.title}</p>
            <p className="text-xs tabular-nums text-[var(--color-text-muted)]">
              {formatDateTime(registration.activity.startsAt)} · {registration.activity.location}
            </p>
          </div>
        ) : null}

        <dl className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <dt className="text-[var(--color-text-muted)]">人數 / 形式</dt>
            <dd className="tabular-nums text-[var(--color-panel)]">
              {registration.participantCount} 人 ·{" "}
              {registrationTypeLabels[registration.registrationType]}
            </dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)]">出席</dt>
            <dd className="text-[var(--color-panel)]">
              {attendanceStatusLabels[registration.attendanceStatus]}
            </dd>
          </div>
          {registration.organizationName ? (
            <div className="col-span-2">
              <dt className="text-[var(--color-text-muted)]">機構</dt>
              <dd className="text-[var(--color-panel)]">{registration.organizationName}</dd>
            </div>
          ) : null}
          {registration.guardianName ? (
            <div className="col-span-2">
              <dt className="text-[var(--color-text-muted)]">家長同意</dt>
              <dd className="text-[var(--color-warning)]">
                {registration.guardianName} · {registration.guardianPhone ?? "未提供電話"}
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

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">義工與活動管理</h1>
          <p className="text-sm text-[var(--color-text-muted)]">建立活動、審批報名，並記錄出席。</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={refreshAll}
            className={`${buttonBase} min-h-11 border border-[var(--color-border)] px-3 text-sm hover:bg-[var(--color-surface-offset)]`}
          >
            <RefreshCw className="h-4 w-4" />
            重新整理
          </button>
          <button
            type="button"
            onClick={() => setShowCreate((open) => !open)}
            aria-expanded={showCreate}
            className={`${buttonBase} min-h-11 bg-[var(--color-primary)] px-3 text-sm text-[var(--color-primary-foreground)] hover:opacity-90`}
          >
            <Plus className="h-4 w-4" />
            新增活動
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-150 ${showCreate ? "rotate-180" : ""}`}
            />
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="待審批人數"
          value={pendingCount}
          emphasis={pendingCount > 0}
        />
        <StatCard
          icon={<CalendarClock className="h-5 w-5" />}
          label="即將舉行的活動"
          value={upcomingCount}
        />
        <StatCard
          icon={<Users className="h-5 w-5" />}
          label="目前顯示的報名"
          value={registrations.length}
        />
      </div>

      {/* Creating an activity is occasional; keeping the 9-field form open on
          every visit pushed the tables the operator actually came for below
          the fold. */}
      {(patchActivity.error || updateRegistration.error) && (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {patchActivity.error?.message ?? updateRegistration.error?.message}
        </p>
      )}
      {showCreate ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            createActivity.mutate();
          }}
          className="grid gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-4"
        >
          <Field label="活動名稱">
            <input
              required
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="活動類型">
            <select
              value={type}
              onChange={(event) => setType(event.target.value as VolunteerActivityType)}
              className={inputClass}
            >
              {Object.entries(activityTypeLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="開始時間">
            <input
              required
              type="datetime-local"
              value={startsAt}
              onChange={(event) => setStartsAt(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="結束時間" hint="可留空">
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(event) => setEndsAt(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="地點">
            <input
              required
              value={location}
              onChange={(event) => setLocation(event.target.value)}
              className={inputClass}
            />
          </Field>
          <Field label="名額" hint="可批准的總人數">
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(event) => setCapacity(Number(event.target.value))}
              className={inputClass}
            />
          </Field>
          <Field label="最低年齡" hint="個人報名下限">
            <input
              type="number"
              min={0}
              value={minAge}
              onChange={(event) => setMinAge(Number(event.target.value))}
              className={inputClass}
            />
          </Field>
          <fieldset className="flex flex-wrap items-center gap-4 text-sm">
            <legend className="mb-1 text-xs font-semibold text-[var(--color-panel)]">
              報名設定
            </legend>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={autoApprove}
                onChange={(event) => setAutoApprove(event.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              自動審批
            </label>
            <label className="flex cursor-pointer items-center gap-2">
              <input
                type="checkbox"
                checked={allowGroups}
                onChange={(event) => setAllowGroups(event.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              接受團體
            </label>
          </fieldset>
          <div className="flex gap-2 md:col-span-4">
            <button
              type="submit"
              disabled={createActivity.isPending}
              className={`${buttonBase} min-h-11 bg-[var(--color-primary)] px-4 text-sm text-[var(--color-primary-foreground)] hover:opacity-90`}
            >
              <Plus className="h-4 w-4" />
              {createActivity.isPending ? "建立中…" : "建立活動"}
            </button>
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className={`${buttonBase} min-h-11 border border-[var(--color-border)] px-4 text-sm hover:bg-[var(--color-surface-offset)]`}
            >
              取消
            </button>
          </div>
          {createActivity.isError ? (
            <p role="alert" className="text-sm text-[var(--color-error)] md:col-span-4">
              建立失敗，請檢查輸入內容後再試。
            </p>
          ) : null}
        </form>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--color-panel)]">活動</h2>
          <input
            value={activityQuery}
            onChange={(event) => {
              setActivityQuery(event.target.value);
              setActivityPage(1);
            }}
            placeholder="搜尋活動名稱或地點"
            aria-label="搜尋活動"
            className={`${inputClass} max-w-64`}
          />
        </div>
        <DataTable
          columns={activityColumns}
          rows={activities}
          getRowKey={(activity) => activity.id}
          loading={activitiesQuery.isLoading}
          empty="尚未建立任何活動。按「新增活動」開始。"
        />
        <TablePager
          page={activityPage}
          pageSize={VOLUNTEER_ADMIN_PAGE_SIZE}
          total={activitiesQuery.data?.total}
          onPageChange={setActivityPage}
          busy={activitiesQuery.isFetching}
          label="活動"
        />
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--color-panel)]">報名</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={registrationStatus}
              onChange={(event) =>
                applyRegistrationFilter(() =>
                  setRegistrationStatus(event.target.value as VolunteerRegistrationStatus | "all"),
                )
              }
              aria-label="按狀態篩選"
              className={`${inputClass} max-w-40`}
            >
              <option value="all">全部狀態</option>
              {Object.entries(registrationStatusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={attendanceStatus}
              onChange={(event) =>
                applyRegistrationFilter(() =>
                  setAttendanceStatus(event.target.value as VolunteerAttendanceStatus | "all"),
                )
              }
              aria-label="按出席狀況篩選"
              className={`${inputClass} max-w-40`}
            >
              <option value="all">全部出席狀況</option>
              {Object.entries(attendanceStatusLabels).map(([value, label]) => (
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
              placeholder="搜尋姓名、電郵或電話"
              aria-label="搜尋報名人"
              className={`${inputClass} max-w-56`}
            />
          </div>
        </div>

        {activityFilter ? (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-primary)] bg-[var(--color-primary-highlight)] px-3 py-2 text-sm">
            <span className="text-[var(--color-panel)]">
              只顯示「<strong>{activityFilter.title}</strong>」（
              {formatDateTime(activityFilter.startsAt)}）的報名
            </span>
            <button
              type="button"
              onClick={() => applyRegistrationFilter(() => setActivityFilter(null))}
              className={`${buttonBase} border border-[var(--color-border)] bg-[var(--color-surface)] hover:bg-[var(--color-surface-offset)]`}
            >
              <X className="h-3.5 w-3.5" />
              清除篩選
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
              ? `「${activityFilter.title}」目前沒有符合條件的報名。`
              : "沒有符合條件的報名。試試放寬篩選條件。"
          }
        />
        <TablePager
          page={registrationPage}
          pageSize={VOLUNTEER_ADMIN_PAGE_SIZE}
          total={registrationsQuery.data?.total}
          onPageChange={setRegistrationPage}
          busy={registrationsQuery.isFetching}
          label="報名"
        />
      </section>
    </div>
  );
}
