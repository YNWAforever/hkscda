import { VolunteerPageHeading } from "../VolunteerPageHeading";
import { VolunteerLink } from "./VolunteerLink";
import { volunteerQueryKeys } from "../../../lib/volunteers/queryKeys";
import { WorkflowSections } from "./WorkflowSections";
import { deliveryLabel } from "../../../lib/notifications/deliveryLabel";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { StatusPill } from "../StatusBadge";
import { fetchAdminJson } from "../../../lib/admin/http";
import { ADMIN_IDENTITY_QUERY_KEY } from "../../../lib/admin/identity";
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
import { paginateSupport } from "./supportPagination";
import {
  buildLegacyPendingHref,
  buildPendingRegistrationHref,
  type ActivityReturnState,
} from "./activityReturnState";
import { buildTaskRegistrationHref, readRegistrationReturnState } from "./registrationReturnState";
import { useVolunteerReturnPosition } from "./useVolunteerReturnPosition";
import type { AdminMeResponse } from "../../../lib/admin/session";
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
  ends_at?: string | null;
  location?: string;
  participant_count?: number;
  capacity?: number;
  approved_participants?: number;
  remaining_capacity?: number;
};
type Data = {
  tasks: Row[];
  pending: Row[];
  notifications: Row[];
  pendingCounts?: PendingCounts;
  page?: number;
  pageSize?: number;
  filteredTotal?: number;
};
const post = <T,>(command: object, signal?: AbortSignal) =>
  fetchAdminJson<T>("/api/admin/volunteers/tasks", {
    method: "POST",
    body: JSON.stringify(command),
    signal,
  });
export function VolunteerTasks({ returnState }: { returnState?: ActivityReturnState } = {}) {
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
  const [contactPageRequest, setContactPageRequest] = useState(1);
  const [notificationPageRequest, setNotificationPageRequest] = useState(1);
  const query = useQuery({
    queryKey: volunteerQueryKeys.key(
      "tasks",
      listState.filters.scope,
      listState.query,
      listState.page,
    ),
    enabled: listState.hydrated,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      post<Data>(
        {
          action: "list",
          scope: listState.filters.scope,
          page: listState.page,
          q: listState.query,
        },
        signal,
      ),
    refetchInterval: 30000,
  });
  const rows = query.isError ? [] : (query.data?.pending ?? []);
  const contactPage = paginateSupport(query.data?.tasks ?? [], contactPageRequest);
  const notificationPage = paginateSupport(
    query.data?.notifications ?? [],
    notificationPageRequest,
  );
  const refreshing = query.isFetching || query.isPlaceholderData || listState.isDebouncing;
  const filteredTotal =
    query.data?.filteredTotal ??
    (listState.filters.scope === "all"
      ? query.data?.pendingCounts?.total
      : query.data?.pendingCounts?.[listState.filters.scope]);
  const returnParams = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  if (returnState && !returnParams.has("activity_return_return_from")) {
    const legacy = new URL(
      buildLegacyPendingHref(
        new URLSearchParams({ ...returnState.safeSearch, return_from: returnState.from }),
      ),
      "http://return.invalid",
    );
    for (const [key, value] of legacy.searchParams)
      if (key.startsWith("activity_return_")) returnParams.set(key, value);
  }
  returnParams.set("return_from", "tasks");
  returnParams.set("pending_scope", listState.filters.scope);
  returnParams.set("page", String(listState.page));
  const taskReturn = readRegistrationReturnState(returnParams);
  const position = useVolunteerReturnPosition({
    listKey: "volunteer-tasks",
    actorUserId:
      cache.getQueryData?.<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY)?.admin.authUserId ?? "",
    scopeKey: JSON.stringify([listState.filters.scope, listState.page, listState.query]),
    ready: Boolean(query.data) && !refreshing && !query.isError,
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
          ? buildPendingRegistrationHref(row.registration_id || row.id, returnState)
          : "/admin/volunteers/operations"
      }
    >
      {copy.open(row.title)}
    </VolunteerLink>
  );
  const changeContactPage = (page: number) => {
    setSelected("");
    setReason("");
    setContactPageRequest(page);
  };
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
        <h2 id="tasks-pending" tabIndex={-1} className="text-xl font-semibold">
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
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            listState.submitQuery();
          }}
        >
          <label className="min-w-0 flex-1">
            <span className="block">{copy.pending.search}</span>
            <input
              type="search"
              maxLength={100}
              placeholder={copy.pending.searchHint}
              className="min-h-11 w-full rounded border px-3"
              {...listState.queryInput}
            />
          </label>
          <button
            type="button"
            className="min-h-11 rounded border px-3"
            onClick={listState.clearQuery}
          >
            {copy.pending.clear}
          </button>
        </form>
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
        {filteredTotal !== undefined && <p role="status">{copy.pending.matched(filteredTotal)}</p>}
        {refreshing && query.data && <p role="status">{copy.pending.updating}</p>}
        {!query.isError && query.data?.pending.length === 0 && <p>{copy.pending.none}</p>}
        {rows.map((row) => {
          const id = row.registration_id ?? row.id;
          const short = id.slice(0, 8);
          const reference = rows.some(
            (other) =>
              (other.registration_id ?? other.id) !== id &&
              (other.registration_id ?? other.id).slice(0, 8) === short,
          )
            ? id
            : short;
          return (
            <article
              tabIndex={-1}
              id={`pending-${id}`}
              key={row.id}
              className="min-w-0 space-y-2 rounded border p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <h3 className="font-semibold break-words">{row.contact_name}</h3>
                <StatusPill tone="warning">{copy.pending.status}</StatusPill>
              </div>
              <p className="text-sm break-all" title={id}>
                {copy.pending.reference(reference)}
              </p>
              <p className="font-medium break-words">{row.title ?? copy.pending.unavailable}</p>
              <p>
                {row.starts_at ? format.sessionTime(row.starts_at) : copy.pending.unavailable}
                {row.ends_at ? ` – ${format.sessionTime(row.ends_at)}` : ""}
              </p>
              <p className="break-words">{row.location ?? copy.pending.unavailable}</p>
              <p>
                {row.participant_count === undefined
                  ? copy.pending.unavailable
                  : copy.pending.participants(row.participant_count)}
              </p>
              <p>
                {row.capacity === undefined ||
                row.approved_participants === undefined ||
                row.remaining_capacity === undefined
                  ? copy.pending.unavailable
                  : copy.pending.capacity(
                      row.capacity,
                      row.approved_participants,
                      row.remaining_capacity,
                    )}
              </p>
              <p className="text-sm">{copy.pending.notReserved}</p>
              <div className="flex flex-wrap gap-3">
                {refreshing ? (
                  <span aria-disabled="true">{copy.pending.process}</span>
                ) : (
                  <VolunteerLink
                    className="inline-flex min-h-11 items-center font-semibold underline"
                    href={buildTaskRegistrationHref(id, taskReturn)}
                    onClick={() => position.remember(`pending-${id}`)}
                  >
                    {copy.pending.process}
                  </VolunteerLink>
                )}
                {row.activity_id && !refreshing && (
                  <VolunteerLink
                    className="inline-flex min-h-11 items-center underline"
                    href={`/admin/volunteers/activities?date_scope=all&selected=${encodeURIComponent(row.activity_id)}`}
                  >
                    {copy.pending.openSession}
                  </VolunteerLink>
                )}
              </div>
            </article>
          );
        })}
        <div className="flex gap-3">
          <button
            className="min-h-11 underline"
            disabled={listState.page === 1 || refreshing}
            onClick={() => listState.setPage(listState.page - 1)}
          >
            {copy.pending.previous}
          </button>
          <button
            className="min-h-11 underline"
            disabled={
              filteredTotal === undefined ||
              refreshing ||
              listState.page * 25 >= (filteredTotal ?? 0)
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
        {contactPage.items.map((row) => (
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
        {contactPage.total > 0 && (
          <div className="space-y-2 pt-2">
            <p role="status">
              {copy.pager.followUps(contactPage.total, contactPage.page, contactPage.pageCount)}
            </p>
            <nav aria-label={copy.pager.contactLabel} className="flex flex-wrap gap-3">
              <button
                type="button"
                className="min-h-11 underline"
                disabled={contactPage.page === 1}
                onClick={() => changeContactPage(contactPage.page - 1)}
              >
                {copy.pager.previous}
              </button>
              <button
                type="button"
                className="min-h-11 underline"
                disabled={contactPage.page === contactPage.pageCount}
                onClick={() => changeContactPage(contactPage.page + 1)}
              >
                {copy.pager.next}
              </button>
            </nav>
          </div>
        )}
      </section>
      <section className="space-y-3">
        <h2 id="tasks-notifications" className="text-xl font-semibold">
          {copy.notifications.title}
        </h2>
        {query.data?.notifications.length === 0 && <p>{copy.notifications.none}</p>}
        {notificationPage.items.map((row) => (
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
        {notificationPage.total > 0 && (
          <div className="space-y-2 pt-2">
            <p role="status">
              {copy.pager.notifications(
                notificationPage.total,
                notificationPage.page,
                notificationPage.pageCount,
              )}
            </p>
            <nav aria-label={copy.pager.notificationsLabel} className="flex flex-wrap gap-3">
              <button
                type="button"
                className="min-h-11 underline"
                disabled={notificationPage.page === 1}
                onClick={() => setNotificationPageRequest(notificationPage.page - 1)}
              >
                {copy.pager.previous}
              </button>
              <button
                type="button"
                className="min-h-11 underline"
                disabled={notificationPage.page === notificationPage.pageCount}
                onClick={() => setNotificationPageRequest(notificationPage.page + 1)}
              >
                {copy.pager.next}
              </button>
            </nav>
          </div>
        )}
      </section>
    </section>
  );
}
