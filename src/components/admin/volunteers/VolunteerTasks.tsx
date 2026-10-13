import { VolunteerPageHeading } from "../VolunteerPageHeading";
import { VolunteerLink } from "./VolunteerLink";
import { volunteerQueryKeys } from "../../../lib/volunteers/queryKeys";
import { WorkflowSections } from "./WorkflowSections";
import { deliveryLabel } from "../../../lib/notifications/deliveryLabel";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { volunteerTasksCopy } from "./volunteerTasksCopy";
import { LoadFailure } from "../LoadFailure";
import {
  useListQueryState,
  parseListPage,
  type ListRouteState,
} from "../../../lib/admin/useListQueryState";
import type { PendingCounts, PendingScope } from "../../../lib/volunteers/pending";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
const taskRoute: ListRouteState<{ scope: PendingScope }> = {
  key: "volunteer-tasks",
  read: (params) => ({
    filters: {
      scope:
        params.get("pending_scope") === "upcoming"
          ? "upcoming"
          : params.get("pending_scope") === "overdue"
            ? "overdue"
            : "all",
    },
    page: parseListPage(params.get("page")),
  }),
  write: (params, filters, page) => {
    params.set("pending_scope", filters.scope);
    params.set("page", String(page));
  },
};
type Row = {
  id: string;
  kind: string;
  title?: string;
  contact_name?: string;
  activity_id?: string;
  registration_id?: string;
  created_at?: string;
  starts_at?: string;
  status?: string;
  delivery_state?: string | null;
  last_error?: string;
  attempts?: number;
};
type Data = {
  tasks: Row[];
  pending: Row[];
  notifications: Row[];
  pendingCounts?: PendingCounts;
  page?: number;
  pageSize?: number;
};
const post = <T,>(command: object, signal?: AbortSignal) =>
  fetchAdminJson<T>("/api/admin/volunteers/tasks", {
    method: "POST",
    body: JSON.stringify(command),
    signal,
  });
export function VolunteerTasks() {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerTasksCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const listState = useListQueryState({
    key: "volunteer-tasks",
    initialFilters: { scope: "all" as PendingScope },
    routeState: taskRoute,
  });
  const cache = useQueryClient();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: volunteerQueryKeys.key("tasks", listState.filters.scope, listState.page),
    enabled: listState.hydrated,
    queryFn: ({ signal }) =>
      post<Data>({ action: "list", scope: listState.filters.scope, page: listState.page }, signal),
    refetchInterval: 30000,
  });
  const mutation = useMutation({
    mutationFn: (command: object) => post(command),
    onSuccess: async () => {
      setSelected("");
      setReason("");
      await cache.invalidateQueries({ queryKey: volunteerQueryKeys.key("tasks") });
    },
  });
  const target = (row: Row) => (
    <VolunteerLink
      className="underline"
      href={
        row.registration_id || !row.kind
          ? `/admin/volunteers/registrations/${encodeURIComponent(row.registration_id || row.id)}`
          : "/admin/volunteers/operations"
      }
    >
      {copy.open(row.title)}
    </VolunteerLink>
  );
  return (
    <section className="space-y-6">
      <VolunteerPageHeading pageId="tasks">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p>{copy.intro}</p>
        <VolunteerLink href="/admin/volunteers/calendar" className="underline">
          {copy.calendarLink}
        </VolunteerLink>
      </VolunteerPageHeading>
      <WorkflowSections
        sections={[
          { id: "tasks-pending", label: copy.steps.pending },
          { id: "tasks-contact", label: copy.steps.contact },
          { id: "tasks-notifications", label: copy.steps.notifications },
        ]}
      />
      {query.isLoading && <p>{copy.loading}</p>}
      {query.error && (
        <LoadFailure
          error={query.error}
          onRetry={() => void query.refetch()}
          title={copy.loadFailed}
          retryLabel={copy.reload}
        />
      )}
      {mutation.error && <p role="alert">{volunteerAdminErrorMessage(mutation.error, language)}</p>}
      <section className="space-y-3">
        <h2 id="tasks-pending" className="text-xl font-semibold">
          {copy.pending.title}
        </h2>
        <label>
          {copy.pending.scope}
          <select
            className="min-h-11 rounded border px-3"
            value={listState.filters.scope}
            onChange={(event) =>
              listState.changeFilter({ scope: event.target.value as PendingScope })
            }
          >
            {(["all", "upcoming", "overdue"] as const).map((scope) => (
              <option key={scope} value={scope}>
                {copy.pending.scopes[scope]}
              </option>
            ))}
          </select>
        </label>
        {query.data?.pendingCounts && (
          <p role="status">
            {copy.pending.counts(
              query.data.pendingCounts.upcoming,
              query.data.pendingCounts.overdue,
              query.data.pendingCounts.total,
            )}{" "}
            · {copy.pending.asOf(format.sessionTime(query.data.pendingCounts.asOf))}
          </p>
        )}
        {query.data?.pending.length === 0 && <p>{copy.pending.none}</p>}
        {query.data?.pending.map((row) => (
          <article key={row.id} className="rounded border p-3">
            {row.contact_name} · {target(row)}
          </article>
        ))}
        <div className="flex gap-3">
          <button
            className="min-h-11 underline"
            disabled={listState.page === 1 || query.isFetching}
            onClick={() => listState.setPage(listState.page - 1)}
          >
            {copy.pending.previous}
          </button>
          <button
            className="min-h-11 underline"
            disabled={
              !query.data?.pendingCounts ||
              query.isFetching ||
              listState.page * 25 >=
                (listState.filters.scope === "all"
                  ? query.data.pendingCounts.total
                  : query.data.pendingCounts[listState.filters.scope])
            }
            onClick={() => listState.setPage(listState.page + 1)}
          >
            {copy.pending.next}
          </button>
        </div>
      </section>
      <section className="space-y-3">
        <h2 id="tasks-contact" className="text-xl font-semibold">
          {copy.contact.title}
        </h2>
        {query.data?.tasks.length === 0 && <p>{copy.contact.none}</p>}
        {query.data?.tasks.map((row) => (
          <article key={row.id} className="space-y-2 rounded border p-3">
            <p>
              {copy.kinds[row.kind] ?? copy.otherFollowUp} · {row.contact_name} · {target(row)}
            </p>
            <button
              className="min-h-11 underline"
              onClick={() => {
                setSelected(row.id);
                setReason("");
                mutation.reset();
              }}
            >
              {copy.contact.record}
            </button>
            {selected === row.id && (
              <div>
                <label>
                  {copy.contact.result}
                  <textarea
                    className="block min-h-24 w-full rounded border p-2"
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="min-h-11 rounded border px-4"
                  disabled={!reason.trim() || mutation.isPending}
                  onClick={() => mutation.mutate({ action: "complete", id: row.id, reason })}
                >
                  {copy.contact.complete}
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 id="tasks-notifications" className="text-xl font-semibold">
          {copy.notifications.title}
        </h2>
        {query.data?.notifications.length === 0 && <p>{copy.notifications.none}</p>}
        {query.data?.notifications.map((row) => (
          <article key={row.id} className="rounded border p-3">
            <p>
              {copy.notifications.line(
                copy.kinds[row.kind] ?? copy.otherNotification,
                copy.statuses[row.status ?? ""] ?? copy.otherStatus,
                row.attempts,
              )}
            </p>
            {deliveryLabel(row.delivery_state, language) && (
              <p>{deliveryLabel(row.delivery_state, language)}</p>
            )}
            {row.last_error && <p>{copy.notifications.reason(row.last_error)}</p>}
            {row.status === "failed" && (
              <button
                className="min-h-11 underline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ action: "retry", id: row.id })}
              >
                {copy.notifications.retry}
              </button>
            )}
          </article>
        ))}
      </section>
    </section>
  );
}
