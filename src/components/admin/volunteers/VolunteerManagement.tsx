import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Copy, Plus, RefreshCw } from "lucide-react";
import { useMemo, useState } from "react";

import { fetchAdminJson } from "../../../lib/admin/http";
import type {
  VolunteerActivitySummary,
  VolunteerActivityType,
  VolunteerRegistrationStatus,
  VolunteerRegistrationSummary,
} from "../../../lib/volunteers/types";
import { DataTable, type DataTableColumn } from "../DataTable";
import {
  buildActivitySearchParams,
  buildRegistrationSearchParams,
  summarizeActivityCapacity,
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

const activityTypeLabels: Record<VolunteerActivityType, string> = {
  volunteer_shift: "義工時段",
  group_activity: "團體活動",
  cleaning_day: "清潔日",
};

function toIsoFromLocal(value: string) {
  return new Date(value).toISOString();
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("zh-HK", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusClass(status: VolunteerRegistrationStatus) {
  const tone = volunteerStatusTone(status);
  if (tone === "success") return "bg-[var(--color-success-highlight)] text-[var(--color-success)]";
  if (tone === "warning") return "bg-[var(--color-surface-offset)] text-[var(--color-warning)]";
  if (tone === "danger") return "bg-[var(--color-primary-highlight)] text-[var(--color-error)]";
  return "bg-[var(--color-surface-offset)] text-[var(--color-panel)]";
}

export function VolunteerManagement() {
  const queryClient = useQueryClient();
  const [activityQuery, setActivityQuery] = useState("");
  const [registrationQuery, setRegistrationQuery] = useState("");
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
        page: 1,
      }).toString(),
    [activityQuery],
  );
  const registrationSearch = useMemo(
    () =>
      buildRegistrationSearchParams({
        q: registrationQuery,
        status: "all",
        attendanceStatus: "all",
        activityId: "",
        page: 1,
      }).toString(),
    [registrationQuery],
  );

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
      void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] });
    },
  });

  const patchActivity = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      fetchAdminJson(`/api/admin/volunteers/activities/${id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] }),
  });

  const cloneActivity = useMutation({
    mutationFn: (id: string) =>
      fetchAdminJson(`/api/admin/volunteers/activities/${id}/clone`, {
        method: "POST",
        body: JSON.stringify({}),
      }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] }),
  });

  const updateRegistration = useMutation({
    mutationFn: ({ id, status }: { id: string; status: VolunteerRegistrationStatus }) =>
      fetchAdminJson(`/api/admin/volunteers/registrations/${id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["volunteer-registrations"] });
      void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] });
    },
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
      cell: (activity) => formatDateTime(activity.startsAt),
    },
    {
      id: "capacity",
      header: "名額",
      cell: (activity) => {
        const capacitySummary = summarizeActivityCapacity(activity);
        return (
          <span className="text-sm">
            {capacitySummary.approved}/{activity.capacity} · 候補 {capacitySummary.waitlisted}
          </span>
        );
      },
    },
    {
      id: "status",
      header: "狀態",
      cell: (activity) => activity.status,
    },
    {
      id: "actions",
      header: "操作",
      cell: (activity) => (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() =>
              patchActivity.mutate({
                id: activity.id,
                body: { status: activity.status === "published" ? "closed" : "published" },
              })
            }
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium"
          >
            {activity.status === "published" ? "關閉" : "發布"}
          </button>
          <button
            type="button"
            onClick={() => cloneActivity.mutate(activity.id)}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium"
          >
            <Copy className="mr-1 inline h-3 w-3" />
            複製
          </button>
        </div>
      ),
    },
  ];

  const registrationColumns: DataTableColumn<RegistrationRow>[] = [
    {
      id: "name",
      header: "報名人",
      cell: (registration) => (
        <div>
          <Link
            to="/admin/volunteers/registrations/$id"
            params={{ id: registration.id }}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            {registration.contactName}
          </Link>
          <p className="text-xs text-[var(--color-text-muted)]">{registration.contactEmail}</p>
        </div>
      ),
    },
    {
      id: "activity",
      header: "活動",
      cell: (registration) => registration.activity?.title ?? registration.activityId,
    },
    {
      id: "people",
      header: "人數",
      cell: (registration) => registration.participantCount,
    },
    {
      id: "status",
      header: "狀態",
      cell: (registration) => (
        <span
          className={`rounded-full px-2 py-1 text-xs font-bold ${statusClass(registration.status)}`}
        >
          {registration.status}
        </span>
      ),
    },
    {
      id: "actions",
      header: "操作",
      cell: (registration) => (
        <div className="flex flex-wrap gap-2">
          {(["approved", "waitlisted", "rejected"] as VolunteerRegistrationStatus[]).map(
            (status) => (
              <button
                key={status}
                type="button"
                onClick={() => updateRegistration.mutate({ id: registration.id, status })}
                className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium"
              >
                {status}
              </button>
            ),
          )}
          <button
            type="button"
            onClick={() => completeAttendance.mutate(registration.id)}
            className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-medium"
          >
            完成
          </button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">義工與活動管理</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            管理義工預約、團體報名與清潔日登記。
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void queryClient.invalidateQueries({ queryKey: ["volunteer-activities"] });
            void queryClient.invalidateQueries({ queryKey: ["volunteer-registrations"] });
          }}
          className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-medium"
        >
          <RefreshCw className="h-4 w-4" />
          重新整理
        </button>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          createActivity.mutate();
        }}
        className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-4"
      >
        <input
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="活動名稱"
          className="rounded-md border border-[var(--color-border)] px-3 py-2"
        />
        <select
          value={type}
          onChange={(event) => setType(event.target.value as VolunteerActivityType)}
          className="rounded-md border border-[var(--color-border)] px-3 py-2"
        >
          {Object.entries(activityTypeLabels).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
        <input
          required
          type="datetime-local"
          value={startsAt}
          onChange={(event) => setStartsAt(event.target.value)}
          className="rounded-md border border-[var(--color-border)] px-3 py-2"
        />
        <input
          type="datetime-local"
          value={endsAt}
          onChange={(event) => setEndsAt(event.target.value)}
          className="rounded-md border border-[var(--color-border)] px-3 py-2"
        />
        <input
          required
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder="地點"
          className="rounded-md border border-[var(--color-border)] px-3 py-2"
        />
        <input
          type="number"
          min={1}
          value={capacity}
          onChange={(event) => setCapacity(Number(event.target.value))}
          className="rounded-md border border-[var(--color-border)] px-3 py-2"
        />
        <input
          type="number"
          min={0}
          value={minAge}
          onChange={(event) => setMinAge(Number(event.target.value))}
          className="rounded-md border border-[var(--color-border)] px-3 py-2"
        />
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={autoApprove}
              onChange={(event) => setAutoApprove(event.target.checked)}
            />
            自動審批
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={allowGroups}
              onChange={(event) => setAllowGroups(event.target.checked)}
            />
            團體
          </label>
        </div>
        <button
          type="submit"
          disabled={createActivity.isPending}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-[var(--color-primary)] px-3 py-2 font-bold text-[var(--color-primary-foreground)] disabled:opacity-60 md:col-span-4"
        >
          <Plus className="h-4 w-4" />
          新增活動
        </button>
      </form>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--color-panel)]">活動</h2>
          <input
            value={activityQuery}
            onChange={(event) => setActivityQuery(event.target.value)}
            placeholder="搜尋活動"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <DataTable
          columns={activityColumns}
          rows={activitiesQuery.data?.activities ?? []}
          getRowKey={(activity) => activity.id}
          loading={activitiesQuery.isLoading}
          empty="沒有活動"
        />
      </section>

      <section className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg font-bold text-[var(--color-panel)]">報名</h2>
          <input
            value={registrationQuery}
            onChange={(event) => setRegistrationQuery(event.target.value)}
            placeholder="搜尋報名人"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm"
          />
        </div>
        <DataTable
          columns={registrationColumns}
          rows={registrationsQuery.data?.registrations ?? []}
          getRowKey={(registration) => registration.id}
          loading={registrationsQuery.isLoading}
          empty="沒有報名"
        />
      </section>
    </div>
  );
}
