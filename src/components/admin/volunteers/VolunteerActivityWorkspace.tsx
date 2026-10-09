import { ActivityDetailSheet } from "./ActivityDetailSheet";
import { ActivityOperationForm } from "./ActivityOperationForm";
import { ActivityOperationPanel } from "./ActivityOperationPanel";
import { ActivitySchedule } from "./ActivitySchedule";
import { VolunteerDraftForm } from "./VolunteerDraftForm";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import {
  parseListPage,
  useListQueryState,
  type ListRouteState,
} from "../../../lib/admin/useListQueryState";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import {
  activityFilterSchema,
  addHkDays,
  generationDates,
  hkDate,
  type ActivityFilter,
} from "../../../lib/volunteers/bulk/service";
import { applyReviewedGroups, reviewBulkOperation } from "../../../lib/volunteers/bulk/review";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { activityWorkspaceCopy } from "./activityWorkspaceCopy";
import type {
  ActivityDetail,
  OperationDraft,
  Operation,
  Reply,
  Row,
  Template,
} from "./activityWorkspaceTypes";
import { volunteerFormatCopy } from "./volunteerFormatCopy";

const call = <T,>(body: unknown, signal?: AbortSignal) =>
  fetchAdminJson<T>("/api/admin/volunteers/bulk", {
    method: "POST",
    body: JSON.stringify(body),
    signal,
  });
const control =
  "min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";
const button =
  control +
  " cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";

/**
 * What the notice under the filters says. The page keeps a code (and the count, for a lock), never
 * a sentence, so a notice shown in Chinese reads in English after the language is changed.
 */
type Notice =
  | { code: "filterChanged" | "sequenceHalted" | "sequenceDone" | "editSelected" }
  | { code: "locked"; count: number };

function noticeText(notice: Notice | null, copy: typeof activityWorkspaceCopy.zh) {
  if (!notice) return "";
  return notice.code === "locked" ? copy.notices.locked(notice.count) : copy.notices[notice.code];
}

/** Separates the excluded dates staff type: whitespace and commas, ASCII or full-width. */
const EXCLUDED_DATE_SEPARATOR = /[\s,，]+/; // admin-copy-exempt: parsing pattern for the full-width comma

function initial() {
  const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const parsed = activityFilterSchema.safeParse({
    from: p.get("from") ?? hkDate(),
    until: p.get("until") ?? addHkDays(hkDate(), 30),
    q: "",
    shelter: p.get("shelter") ?? "",
    template: p.get("template") ?? "",
    status: p.get("status") ?? "",
    scenario: p.get("scenario") ?? "",
    readiness: p.get("readiness") ?? "",
    shortage: p.get("shortage") === "true",
    sort: p.get("sort") ?? "asc",
  });
  return {
    filter: parsed.success
      ? parsed.data
      : { from: hkDate(), until: addHkDays(hkDate(), 30), sort: "asc" as const },
    page: parseListPage(p.get("page")),
    view: p.get("view") === "calendar" ? "calendar" : "table",
    selected: /^[0-9a-f-]{36}$/.test(p.get("selected") ?? "") ? p.get("selected")! : null,
    operation: /^[0-9a-f-]{36}$/.test(p.get("operation") ?? "") ? p.get("operation")! : null,
  };
}
const ACTIVITY_FILTER_KEYS = [
  "from",
  "until",
  "shelter",
  "template",
  "status",
  "scenario",
  "readiness",
  "shortage",
  "sort",
] as const;
const ACTIVITY_ROUTE: ListRouteState<ActivityFilter> = {
  key: "volunteer-workspace",
  read: (params, defaults) => {
    const parsed = activityFilterSchema.safeParse({
      ...defaults,
      from: params.get("from") ?? defaults.from,
      until: params.get("until") ?? defaults.until,
      q: "",
      shelter: params.get("shelter") ?? "",
      template: params.get("template") ?? "",
      status: params.get("status") ?? "",
      scenario: params.get("scenario") ?? "",
      readiness: params.get("readiness") ?? "",
      shortage: params.get("shortage") === "true",
      sort: params.get("sort") ?? defaults.sort,
    });
    return {
      filters: parsed.success ? parsed.data : defaults,
      page: parseListPage(params.get("page")),
    };
  },
  write: (params, filters, page) => {
    for (const key of ACTIVITY_FILTER_KEYS) params.delete(key);
    for (const key of ACTIVITY_FILTER_KEYS) {
      const value = filters[key];
      if (value !== undefined && value !== "" && value !== false) params.set(key, String(value));
    }
    params.set("page", String(page));
  },
};

function initialOperationDraft(): OperationDraft {
  return {
    mode: "generate",
    template: "",
    templateKeys: [],
    from: hkDate(),
    until: addHkDays(hkDate(), 27),
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    excluded: "",
    reason: "",
    title: "",
    description: "",
    attendance: "attended",
    correction: false,
  };
}

export function VolunteerActivityWorkspace({ initialView }: { initialView?: "calendar" } = {}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(activityWorkspaceCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const [state] = useState(initial);
  const listState = useListQueryState<ActivityFilter>({
    key: "volunteer-workspace",
    initialFilters: { ...state.filter, q: "" },
    initialPage: state.page,
    routeState: ACTIVITY_ROUTE,
    onScopeChange: () => {
      setIds([]);
      setSelection(null);
      setNotice({ code: "filterChanged" });
    },
  });
  const filter = useMemo(
    () => ({ ...listState.filters, q: listState.query }),
    [listState.filters, listState.query],
  );
  const page = listState.page;
  const setPage = listState.setPage;
  const [advancedFiltersOpen, setAdvancedFiltersOpen] = useState(false);
  const activeAdvancedFilters = [
    filter.shelter,
    filter.template,
    filter.status,
    filter.scenario,
    filter.readiness,
    filter.shortage,
  ].filter(Boolean).length;
  const [view, setView] = useState(initialView ?? state.view);
  const [selected, setSelected] = useState<string | null>(state.selected);
  const [detailPage, setDetailPage] = useState(1);
  const [historyPage, setHistoryPage] = useState(1);
  const [ids, setIds] = useState<string[]>([]);
  const [selection, setSelection] = useState<Operation | null>(null);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [draft, setDraft] = useState<OperationDraft>(initialOperationDraft);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [reviewAll, setReviewAll] = useState(false);
  const [showOperation, setShowOperation] = useState(false);
  const cache = useQueryClient();
  const tableHeading = useRef<HTMLHeadingElement>(null);
  const patchDraft = (patch: Partial<OperationDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const list = useQuery({
    queryKey: ["volunteer-workspace", filter, page],
    enabled: listState.hydrated,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<{ activities: Row[]; total: number }>({ action: "list", filter, page }, signal),
  });
  const templates = useQuery({
    queryKey: ["volunteer-workspace-templates"],
    queryFn: () => call<{ templates: Template[] }>({ action: "templates" }),
  });
  const detail = useQuery({
    queryKey: ["volunteer-workspace-detail", selected, detailPage, historyPage],
    enabled: Boolean(selected),
    queryFn: () =>
      call<ActivityDetail>({
        action: "detail",
        activity_id: selected,
        page: detailPage,
        history_page: historyPage,
      }),
  });
  const restored = useQuery({
    queryKey: ["volunteer-operation-restore", state.operation],
    enabled: Boolean(state.operation),
    queryFn: () => call<Reply>({ action: "status", operation_id: state.operation }),
  });
  useEffect(() => {
    if (restored.data) {
      setOperation(restored.data.operation);
      setReviewed([]);
      setReviewAll(false);
      setShowOperation(true);
    }
  }, [restored.data]);
  useEffect(() => {
    if (!listState.hydrated) return;
    const params = new URLSearchParams(window.location.search);
    params.set("view", view);
    if (selected) params.set("selected", selected);
    else params.delete("selected");
    if (operation) params.set("operation", operation.id);
    else params.delete("operation");
    window.history.replaceState(
      window.history.state,
      "",
      window.location.pathname + "?" + params.toString() + window.location.hash,
    );
  }, [listState.hydrated, view, selected, operation]);
  useEffect(() => {
    const onPopState = () => {
      const restored = initial();
      setView(restored.view);
      setSelected(restored.selected);
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  function updateFilter(next: Partial<ActivityFilter>) {
    listState.changeFilter(next);
  }
  const choose = useMutation({
    mutationFn: (all: boolean) =>
      call<Reply>({
        action: "select",
        mode: all ? "all" : "page",
        filter,
        ids: all ? [] : ids,
        idempotency_key: crypto.randomUUID(),
      }),
    onSuccess: (data) => {
      setSelection(data.operation);
      setNotice({ code: "locked", count: data.operation.selection.length });
    },
  });
  const preview = useMutation({
    mutationFn: async () => {
      const dates = generationDates(
        draft.from,
        draft.until,
        draft.weekdays,
        draft.excluded.split(EXCLUDED_DATE_SEPARATOR).filter(Boolean),
      );
      let input: unknown;
      if (draft.mode === "generate") input = { template_keys: draft.templateKeys, dates };
      else if (draft.mode === "copy")
        input = {
          source_id: selection?.selection[0]?.id,
          template_key: draft.template || undefined,
          dates,
        };
      else if (draft.mode === "edit")
        input = {
          changes: {
            ...(draft.title ? { title: draft.title } : {}),
            ...(draft.description ? { description: draft.description } : {}),
          },
        };
      else if (draft.mode === "rebind")
        input = { version_id: draft.template, reason: draft.reason };
      else if (draft.mode === "attendance")
        input = {
          attendance_status: draft.attendance,
          command: draft.correction ? "correct" : "record",
          ...(draft.reason ? { reason: draft.reason } : {}),
        };
      else input = { reason: draft.reason };
      return call<Reply>({
        action: "preview",
        operation: draft.mode,
        input,
        selection_id: selection?.id,
        idempotency_key: crypto.randomUUID(),
      });
    },
    onSuccess: (data) => {
      setOperation(data.operation);
      setReviewed([]);
      setReviewAll(false);
      setShowOperation(true);
    },
  });
  function resetOperationReview() {
    setReviewed([]);
    setReviewAll(false);
  }
  const apply = useMutation({
    onSettled: resetOperationReview,
    mutationFn: (index: number) =>
      call<Reply>({ action: "apply", operation_id: operation?.id, group_index: index }),
    onSuccess: (data) => {
      setOperation(data.operation);
      setReviewAll(false);
      void cache.invalidateQueries({ queryKey: ["volunteer-workspace"] });
      void cache.invalidateQueries({ queryKey: ["volunteer-workspace-detail"] });
    },
  });
  const sequence = useMutation({
    onSettled: resetOperationReview,
    mutationFn: () =>
      applyReviewedGroups(
        operation!,
        async (id, index) =>
          (await call<Reply>({ action: "apply", operation_id: id, group_index: index })).operation,
        async (id) => (await call<Reply>({ action: "status", operation_id: id })).operation,
      ),
    onSuccess: ({ operation: latest, halted }) => {
      setOperation(latest);
      setReviewAll(false);
      setNotice({ code: halted ? "sequenceHalted" : "sequenceDone" });
      void cache.invalidateQueries({ queryKey: ["volunteer-workspace"] });
      void cache.invalidateQueries({ queryKey: ["volunteer-workspace-detail"] });
    },
  });
  const refresh = useMutation({
    onSettled: resetOperationReview,
    mutationFn: () => call<Reply>({ action: "status", operation_id: operation?.id }),
    onSuccess: (data) => {
      setOperation(data.operation);
      setReviewAll(false);
    },
  });
  const failure = [
    list.error,
    templates.error,
    choose.error,
    preview.error,
    apply.error,
    sequence.error,
    refresh.error,
    restored.error,
  ].find(Boolean);
  const error = failure ? (volunteerAdminErrorMessage(failure, language) ?? "") : "";
  const rows = list.isError ? [] : (list.data?.activities ?? []);
  const total = list.data?.total ?? 0;
  const listRefreshing = list.isFetching || listState.isDebouncing || list.isPlaceholderData;
  const review = operation ? reviewBulkOperation(operation) : null;
  const templateList = templates.data?.templates ?? [];
  const templateNames = Object.fromEntries(
    templateList.map((template) => [template.template_key, template.name]),
  );
  const uniqueTemplates = Array.from(
    new Map(templateList.map((t) => [t.template_key, t])).values(),
  );
  const previewDisabled =
    preview.isPending ||
    sequence.isPending ||
    (draft.mode !== "generate" && draft.mode !== "copy" && !selection) ||
    (draft.mode === "copy" && !selection);
  function shift(days: number) {
    const start = filter.from ?? hkDate();
    updateFilter({
      from: addHkDays(start, days),
      until: addHkDays(filter.until ?? addHkDays(start, 30), days),
    });
  }
  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p>{copy.intro}</p>
        </div>
        <a className={button} href="/admin/volunteers/settings">
          {copy.policyLink}
        </a>
      </header>
      <VolunteerDraftForm />
      <section aria-label={copy.filters.label} className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 sm:col-span-1">
          {copy.filters.search}
          <input className={control + " w-full"} {...listState.queryInput} />
        </label>
        <label>
          {copy.filters.from}
          <input
            type="date"
            className={control + " w-full"}
            value={filter.from ?? ""}
            onChange={(e) => updateFilter({ from: e.target.value || undefined })}
          />
        </label>
        <label>
          {copy.filters.until}
          <input
            type="date"
            className={control + " w-full"}
            value={filter.until ?? ""}
            onChange={(e) => updateFilter({ until: e.target.value || undefined })}
          />
        </label>
        <button
          type="button"
          className={button + " col-span-2 sm:hidden"}
          aria-expanded={advancedFiltersOpen}
          aria-controls="advanced-activity-filters"
          onClick={() => setAdvancedFiltersOpen((open) => !open)}
        >
          {copy.filters.more(activeAdvancedFilters)}
        </button>
        <div
          id="advanced-activity-filters"
          className={
            (advancedFiltersOpen ? "grid" : "hidden") +
            " col-span-2 gap-3 sm:col-span-3 sm:grid sm:grid-cols-3"
          }
        >
          <label>
            {copy.filters.shelter}
            <input
              className={control + " w-full"}
              value={filter.shelter ?? ""}
              onChange={(e) => updateFilter({ shelter: e.target.value })}
            />
          </label>
          <label>
            {copy.filters.template}
            <select
              className={control + " w-full"}
              value={filter.template ?? ""}
              onChange={(e) => updateFilter({ template: e.target.value })}
            >
              <option value="">{copy.filters.allTemplates}</option>
              {uniqueTemplates.map((t) => (
                <option key={t.template_key} value={t.template_key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.filters.status}
            <select
              className={control + " w-full"}
              value={filter.status ?? ""}
              onChange={(e) => updateFilter({ status: e.target.value as ActivityFilter["status"] })}
            >
              <option value="">{copy.filters.allStatuses}</option>
              {(["draft", "published", "cancelled", "closed"] as const).map((s) => (
                <option key={s} value={s}>
                  {copy.states[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            {copy.filters.scenario}
            <select
              className={control + " w-full"}
              value={filter.scenario ?? ""}
              onChange={(e) =>
                updateFilter({ scenario: e.target.value as ActivityFilter["scenario"] })
              }
            >
              <option value="">{copy.filters.allScenarios}</option>
              <option value="confirmed_group">{copy.states.confirmed_group}</option>
              <option value="no_confirmed_group">{copy.states.no_confirmed_group}</option>
            </select>
          </label>
          <label>
            {copy.filters.policy}
            <select
              className={control + " w-full"}
              value={filter.readiness ?? ""}
              onChange={(e) =>
                updateFilter({ readiness: e.target.value as ActivityFilter["readiness"] })
              }
            >
              <option value="">{copy.filters.allPolicies}</option>
              <option value="ready">{copy.filters.policyReady}</option>
              <option value="missing">{copy.filters.policyMissing}</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filter.shortage ?? false}
              onChange={(e) => updateFilter({ shortage: e.target.checked })}
            />
            {copy.filters.shortage}
          </label>
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          onClick={() => updateFilter({ from: hkDate(), until: addHkDays(hkDate(), 30) })}
        >
          {copy.filters.next30}
        </button>
        <button className={button} onClick={() => shift(-30)}>
          {copy.filters.previous}
        </button>
        <button className={button} onClick={() => shift(30)}>
          {copy.filters.next}
        </button>
        <button
          className={button}
          onClick={() =>
            updateFilter({ from: undefined, until: addHkDays(hkDate(), -1), sort: "desc" })
          }
        >
          {copy.filters.past}
        </button>
        <button
          className={button}
          onClick={() => updateFilter({ from: undefined, until: undefined })}
        >
          {copy.filters.allDates}
        </button>
        <button
          className={button}
          onClick={() => setView(view === "calendar" ? "table" : "calendar")}
        >
          {view === "calendar" ? copy.filters.listView : copy.filters.calendarView}
        </button>
        <label>
          {copy.filters.sort}{" "}
          <select
            className={control}
            value={filter.sort}
            onChange={(e) => updateFilter({ sort: e.target.value as "asc" | "desc" })}
          >
            <option value="asc">{copy.filters.earliestFirst}</option>
            <option value="desc">{copy.filters.latestFirst}</option>
          </select>
        </label>
      </div>
      {error && (
        <div role="alert" className="rounded border border-[var(--color-error)] p-3">
          {error}
          {copy.errorGap}
          <button
            className={button}
            onClick={() => {
              void list.refetch();
              void templates.refetch();
            }}
          >
            {copy.reload}
          </button>
        </div>
      )}
      <p role="status">{noticeText(notice, copy)}</p>
      <section aria-label={copy.list.label}>
        <h2 ref={tableHeading} tabIndex={-1} className="text-lg font-bold">
          {copy.list.heading(list.isError ? null : total)}
        </h2>
        <div className="my-3 flex flex-wrap items-center gap-2">
          <button
            className={button}
            disabled={!rows.length || listRefreshing}
            onClick={() => {
              setIds(Array.from(new Set([...ids, ...rows.map((r) => r.id)])));
              setSelection(null);
            }}
          >
            {copy.list.selectPage(rows.length)}
          </button>
          <button
            className={button}
            disabled={!ids.length || choose.isPending || listRefreshing || list.isError}
            onClick={() => choose.mutate(false)}
          >
            {copy.list.lockSelected(ids.length)}
          </button>
          <button
            className={button}
            disabled={!total || choose.isPending || listRefreshing || list.isError}
            onClick={() => choose.mutate(true)}
          >
            {copy.list.lockAll(total)}
          </button>
          <button
            className={button}
            onClick={() => {
              setIds([]);
              setSelection(null);
            }}
          >
            {copy.list.clear}
          </button>
          <span>{copy.list.locked(selection?.selection.length ?? 0)}</span>
          {selection && (
            <span className="text-sm">
              {copy.list.snapshot(
                format.sessionTime(selection.created_at),
                format.sessionTime(selection.expires_at),
              )}
            </span>
          )}
        </div>
        {listRefreshing && list.data ? <p role="status">{copy.list.updating}</p> : null}
        {list.isPending ? (
          <p role="status">{copy.list.loading}</p>
        ) : list.isError ? (
          <p>{copy.list.unavailable}</p>
        ) : !rows.length ? (
          <p>
            {filter.q || filter.shelter || filter.template ? copy.list.noMatch : copy.list.empty}
          </p>
        ) : (
          <ActivitySchedule
            rows={rows}
            view={view}
            from={filter.from}
            until={filter.until}
            ids={ids}
            templateNames={templateNames}
            onToggle={(id, checked) => {
              if (listRefreshing) return;
              setIds(checked ? [...ids, id] : ids.filter((value) => value !== id));
              setSelection(null);
            }}
            onOpen={(id) => {
              setSelected(id);
              setDetailPage(1);
              setHistoryPage(1);
            }}
          />
        )}
        <div className="mt-3 flex items-center gap-3">
          <button
            className={button}
            disabled={page === 1 || listRefreshing || list.isError}
            onClick={() => setPage((p) => p - 1)}
          >
            {copy.list.previous}
          </button>
          <span>{copy.list.page(page, Math.max(1, Math.ceil(total / 25)))}</span>
          <button
            className={button}
            disabled={page * 25 >= total || listRefreshing || list.isError}
            onClick={() => setPage((p) => p + 1)}
          >
            {copy.list.next}
          </button>
        </div>
      </section>
      <ActivityOperationForm
        draft={draft}
        onChange={patchDraft}
        templates={templateList}
        previewDisabled={previewDisabled}
        onPreview={() => preview.mutate()}
      />
      {operation && review && (
        <ActivityOperationPanel
          operation={operation}
          review={review}
          templates={templateList}
          showOperation={showOperation}
          onToggleShow={() => setShowOperation((v) => !v)}
          onRefresh={() => refresh.mutate()}
          reviewAll={reviewAll}
          onReviewAll={setReviewAll}
          reviewed={reviewed}
          onReview={(index, checked) =>
            setReviewed(checked ? [...reviewed, index] : reviewed.filter((n) => n !== index))
          }
          sequencePending={sequence.isPending}
          applyPending={apply.isPending}
          onSequence={() => sequence.mutate()}
          onApply={(index) => apply.mutate(index)}
        />
      )}
      <ActivityDetailSheet
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          tableHeading.current?.focus();
        }}
        detail={detail}
        detailPage={detailPage}
        historyPage={historyPage}
        onDetailPage={setDetailPage}
        onHistoryPage={setHistoryPage}
        onEdit={(activity) => {
          setIds([activity.id]);
          patchDraft({
            mode: "edit",
            title: activity.title,
            description: activity.description ?? "",
          });
          setSelected(null);
          setNotice({ code: "editSelected" });
        }}
      />
    </div>
  );
}
