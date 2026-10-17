import { VolunteerPageHeading } from "../VolunteerPageHeading";
import { refreshVolunteerQueries } from "./refreshVolunteerQueries";
import { volunteerQueryKeys, invalidateVolunteerQueries } from "../../../lib/volunteers/queryKeys";
import { adminIdentityQueryOptions, ADMIN_IDENTITY_QUERY_KEY } from "../../../lib/admin/identity";
import {
  createAttendanceController,
  initialAttendanceRecoveryState,
  attendancePointerKey,
  readAttendanceOperationPointer,
} from "../../../lib/volunteers/bulk/attendanceRecovery";
import {
  parseRosterAttendanceReply,
  type RosterAttendanceOperation,
} from "../../../lib/volunteers/bulk/attendance";
import { ActivityAttendancePanel } from "./ActivityAttendancePanel";
import { ActivityAttendanceRecovery } from "./ActivityAttendanceRecovery";
import { workspaceTemplatesQueryOptions } from "./workspaceQueries";
import { ActivityDetailSheet } from "./ActivityDetailSheet";
import { ActivityOperationForm } from "./ActivityOperationForm";
import { ActivityOperationPanel } from "./ActivityOperationPanel";
import { ActivitySchedule } from "./ActivitySchedule";
import {
  calendarRangeProblem,
  collectCalendarPage,
  calendarCoverage,
  type CalendarCollection,
} from "./activityCalendar";
import { VolunteerDraftForm } from "./VolunteerDraftForm";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { useListQueryState, type ListRouteState } from "../../../lib/admin/useListQueryState";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import {
  addHkDays,
  generationDates,
  hkDate,
  type ActivityFilter,
} from "../../../lib/volunteers/bulk/service";
import { applyReviewedGroups, reviewBulkOperation } from "../../../lib/volunteers/bulk/review";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { uniqueTemplates } from "./activityTemplates";
import { activityWorkspaceCopy } from "./activityWorkspaceCopy";
import type {
  ActivityDetail,
  OperationDraft,
  Operation,
  Reply,
  Row,
} from "./activityWorkspaceTypes";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
import { LoadFailure } from "../LoadFailure";
import { readActivityReturnState } from "./activityReturnState";
import { useVolunteerReturnPosition } from "./useVolunteerReturnPosition";
import type { AdminMeResponse } from "../../../lib/admin/session";
import {
  readActivityRouteState,
  writeActivityRouteState,
  toActivityApiFilter,
  type ActivityUiFilters,
} from "./activityRouteState";

const call = <T,>(body: unknown, signal?: AbortSignal, expectedActorUserId?: string) =>
  fetchAdminJson<T>(
    "/api/admin/volunteers/bulk",
    {
      method: "POST",
      body: JSON.stringify(body),
      signal,
    },
    expectedActorUserId,
  );
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

function initial(defaultView?: "calendar") {
  const p = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const parsed = readActivityRouteState(p, hkDate());
  return {
    filter: parsed.filters,
    page: parsed.page,
    detailPage: parsed.detailPage,
    view: p.has("view")
      ? p.get("view") === "calendar"
        ? "calendar"
        : "table"
      : (defaultView ?? "table"),
    selected: /^[0-9a-f-]{36}$/.test(p.get("selected") ?? "") ? p.get("selected")! : null,
    operation: /^[0-9a-f-]{36}$/.test(p.get("operation") ?? "") ? p.get("operation")! : null,
    attendanceIntent: p.get("attendance_intent") === "apply",
  };
}
const ACTIVITY_ROUTE: ListRouteState<ActivityUiFilters> = {
  key: "volunteer-workspace",
  read: (params) => readActivityRouteState(params, hkDate()),
  write: (params, filters, page) => writeActivityRouteState(params, { filters, page }),
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
  const cache = useQueryClient();
  const identity = useQuery(adminIdentityQueryOptions());
  const actorUserId = identity.data?.admin.authUserId ?? "";
  const [state] = useState(() => initial(initialView));
  const [view, setView] = useState(state.view);
  const [selected, setSelected] = useState<string | null>(state.selected);
  const [detailPage, setDetailPage] = useState(state.detailPage);
  const [operation, setOperation] = useState<Operation | null>(null);
  const [operationId, setOperationId] = useState<string | null>(state.operation);
  const [attendanceIntent, setAttendanceIntent] = useState(state.attendanceIntent);
  const [attendanceState, setAttendanceState] = useState(() =>
    initialAttendanceRecoveryState(actorUserId),
  );
  const live = useRef({ cache, actorUserId, mounted: true });
  live.current = { cache, actorUserId, mounted: live.current.mounted };
  const [attendanceController] = useState(() =>
    createAttendanceController({
      send: (command, actor) => {
        if (!live.current.mounted) throw new Error("Workspace is no longer mounted");
        if (command.action === "status" || command.action === "attendance_lookup") {
          const key =
            command.action === "status"
              ? volunteerQueryKeys.key("operationRestore", command.operation_id, actor)
              : volunteerQueryKeys.key(
                  "operationRestore",
                  "attendance-lookup",
                  command.idempotency_key,
                  actor,
                );
          return live.current.cache.fetchQuery({
            queryKey: key,
            queryFn: ({ signal }) => call(command, signal, actor),
            staleTime: 0,
            retry: false,
          });
        }
        return call(command, undefined, actor);
      },
      async savePointer(pointer) {
        if (!live.current.mounted || live.current.actorUserId !== pointer.actorUserId)
          throw new Error("Identity changed");
        try {
          const key = attendancePointerKey(pointer.actorUserId),
            value = JSON.stringify(pointer);
          window.sessionStorage.setItem(key, value);
          if (window.sessionStorage.getItem(key) !== value)
            throw new Error("Pointer readback differs");
          return "session";
        } catch {
          if (!pointer.operationId) return "memory";
          await new Promise<void>((resolve) => window.requestAnimationFrame(() => resolve()));
          const search = new URLSearchParams(window.location.search);
          return live.current.actorUserId === pointer.actorUserId &&
            search.get("operation") === pointer.operationId &&
            (pointer.phase !== "applying" || search.get("attendance_intent") === "apply")
            ? "url"
            : "memory";
        }
      },
      readPointer(actor) {
        try {
          return readAttendanceOperationPointer(window.sessionStorage, actor);
        } catch {
          return null;
        }
      },
      invalidate: () => invalidateVolunteerQueries(live.current.cache, "attendance"),
      onState(next) {
        if (!live.current.mounted) return;
        if (next.actorUserId && next.actorUserId !== live.current.actorUserId) return;
        setAttendanceState(next);
        if (next.phase === "previewing") {
          setOperation(null);
          setOperationId(null);
          setAttendanceIntent(false);
        }
        if (next.operationId) setOperationId(next.operationId);
        if (next.applyIntent) setAttendanceIntent(true);
        if (next.problem === "pointer_unavailable") setAttendanceIntent(false);
      },
    }),
  );
  function clearAttendanceOperation() {
    if (
      attendanceController.getState().phase !== "draft" ||
      attendanceController.getState().actorUserId !== actorUserId
    )
      return;
    try {
      window.sessionStorage.removeItem(attendancePointerKey(actorUserId));
    } catch {
      /* Optional storage. */
    }
    setOperationId(null);
    setAttendanceIntent(false);
  }
  function openOriginalAttendance() {
    if (live.current.actorUserId !== actorUserId) return;
    const original = attendanceController.getState().operation;
    if (original) {
      setSelected(original.activity_id);
      setDetailPage(original.scope.page);
    }
  }
  function invalidateUnsubmittedAttendance(
    nextActivityId: string | null,
    nextPage: number,
    nextOperationId?: string | null,
  ): string | null | undefined {
    const current = attendanceController.getState();
    if (!current.operationId && !current.previewKey) return undefined;
    const terminal =
      current.operation?.state === "completed" || current.operation?.state === "expired";
    if (current.applyIntent && !terminal) return undefined;
    const activity = current.operation?.activity_id ?? current.previewCommand?.activity_id;
    const page = current.operation?.scope.page ?? current.previewCommand?.page;
    const changedScope = Boolean(
      nextActivityId && activity && (nextActivityId !== activity || nextPage !== page),
    );
    const changedOperation =
      nextOperationId !== undefined && nextOperationId !== current.operationId;
    if (terminal && !changedOperation) return undefined;
    if (!changedScope && !changedOperation) return undefined;
    const id = current.operationId;
    attendanceController.cancelPreview(actorUserId);
    if (attendanceController.getState().phase !== "draft") return undefined;
    clearAttendanceOperation();
    return id;
  }
  function changeDetailPage(next: number) {
    if (next !== detailPage) invalidateUnsubmittedAttendance(selected, next);
    setDetailPage(next);
  }
  const routeState = useMemo<ListRouteState<ActivityUiFilters>>(
    () => ({
      ...ACTIVITY_ROUTE,
      write(params, filters, page) {
        ACTIVITY_ROUTE.write(params, filters, page);
        params.set("view", view);
        if (selected) params.set("selected", selected);
        else params.delete("selected");
        if (operationId) params.set("operation", operationId);
        else params.delete("operation");
        if (operationId && attendanceIntent) params.set("attendance_intent", "apply");
        else params.delete("attendance_intent");
        if (selected && detailPage > 1) params.set("detail_page", String(detailPage));
        else params.delete("detail_page");
      },
    }),
    [operationId, selected, view, detailPage, attendanceIntent],
  );
  const listState = useListQueryState<ActivityUiFilters>({
    key: "volunteer-workspace",
    initialFilters: { ...state.filter, q: "" },
    initialPage: state.page,
    routeState,
    onScopeChange: () => {
      setIds([]);
      setSelection(null);
      setNotice({ code: "filterChanged" });
    },
  });
  const filter = useMemo(
    () => toActivityApiFilter({ ...listState.filters, q: listState.query }),
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
  const [historyPage, setHistoryPage] = useState(1);
  const [ids, setIds] = useState<string[]>([]);
  const [selection, setSelection] = useState<Operation | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [draft, setDraft] = useState<OperationDraft>(initialOperationDraft);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [reviewAll, setReviewAll] = useState(false);
  const [showOperation, setShowOperation] = useState(false);
  const tableHeading = useRef<HTMLHeadingElement>(null);
  const patchDraft = (patch: Partial<OperationDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));
  const rangeProblem = view === "calendar" ? calendarRangeProblem(filter) : null;
  const calendarScope = JSON.stringify([actorUserId, filter]);
  const [calendarPages, setCalendarPages] = useState<CalendarCollection<Row> | null>(null);
  const list = useQuery({
    queryKey: volunteerQueryKeys.key("workspace", filter, page),
    enabled: listState.hydrated && !rangeProblem,
    placeholderData: keepPreviousData,
    queryFn: ({ signal }) =>
      call<{ activities: Row[]; total: number }>({ action: "list", filter, page }, signal),
  });
  const currentCalendarPage =
    view === "calendar" && !rangeProblem && list.isSuccess && !list.isPlaceholderData
      ? list.data
      : null;
  const calendar = calendarCoverage(
    currentCalendarPage
      ? collectCalendarPage(calendarPages, calendarScope, page, currentCalendarPage)
      : calendarPages,
    calendarScope,
  );
  useEffect(() => {
    if (currentCalendarPage)
      setCalendarPages((previous) =>
        collectCalendarPage(previous, calendarScope, page, currentCalendarPage),
      );
  }, [currentCalendarPage, calendarScope, page]);
  const templates = useQuery(workspaceTemplatesQueryOptions());
  const detail = useQuery({
    queryKey: volunteerQueryKeys.key("workspaceDetail", selected, detailPage, historyPage),
    enabled: Boolean(selected),
    queryFn: ({ signal }) =>
      call<ActivityDetail>(
        {
          action: "detail",
          activity_id: selected,
          page: detailPage,
          history_page: historyPage,
        },
        signal,
      ),
  });
  const restored = useQuery({
    queryKey: volunteerQueryKeys.key("operationRestore", operationId, actorUserId),
    enabled: Boolean(
      operationId &&
      actorUserId &&
      operation?.id !== operationId &&
      attendanceState.operation?.id !== operationId,
    ),
    queryFn: async ({ signal }) => {
      const result = await call<Reply | { kind: string; operation: RosterAttendanceOperation }>(
        { action: "status", operation_id: operationId },
        signal,
        actorUserId,
      );
      if (!result?.operation) throw new Error("Invalid operation response");
      if (result.operation.action === "roster_attendance") parseRosterAttendanceReply(result);
      return result;
    },
    retry: false,
  });
  useEffect(() => {
    if (
      restored.data &&
      !restored.isFetching &&
      actorUserId &&
      restored.data.operation.id === operationId
    ) {
      if (restored.data.operation.action === "roster_attendance") {
        if (attendanceController.getState().operation?.id === operationId) return;
        const original = parseRosterAttendanceReply(restored.data);
        attendanceController.hydrate(original, actorUserId, attendanceIntent);
        if (!selected) {
          setSelected(original.activity_id);
          setDetailPage(original.scope.page);
        }
        return;
      }
      const original = attendanceController.getState();
      if (original.operationId && original.operationId !== restored.data.operation.id) return;
      attendanceController.clearIdentity(actorUserId);
      setOperation((restored.data as Reply).operation);
      setReviewed([]);
      setReviewAll(false);
      setShowOperation(true);
    }
  }, [
    restored.data,
    restored.isFetching,
    actorUserId,
    operationId,
    attendanceController,
    attendanceIntent,
    selected,
  ]);
  useEffect(() => {
    if (live.current.actorUserId !== actorUserId) return;
    if (!actorUserId) return;
    if (attendanceController.getState().actorUserId !== actorUserId)
      attendanceController.clearIdentity(actorUserId);
    if (!operationId) void attendanceController.restore(actorUserId);
    else if (operation?.id !== operationId)
      attendanceController.beginRestore(actorUserId, operationId, attendanceIntent);
  }, [actorUserId, operationId, attendanceIntent, operation?.id, attendanceController]);
  useEffect(() => {
    live.current.mounted = true;
    const clear = () => {
      live.current = { ...live.current, actorUserId: "" };
      attendanceController.clearIdentity();
      setOperation(null);
      setSelection(null);
      setIds([]);
      setSelected(null);
      setCalendarPages(null);
      setDraft(initialOperationDraft());
      setReviewed([]);
      setReviewAll(false);
      setShowOperation(false);
    };
    window.addEventListener("hkscda-admin-identity-cleared", clear);
    return () => {
      live.current.mounted = false;
      window.removeEventListener("hkscda-admin-identity-cleared", clear);
    };
  }, [attendanceController]);
  useEffect(() => {
    const onPopState = () => {
      const restored = initial(initialView);
      const prior = attendanceController.getState();
      const invalidated = invalidateUnsubmittedAttendance(
        restored.selected,
        restored.detailPage,
        restored.operation,
      );
      setView(restored.view);
      setSelected(restored.selected);
      setDetailPage(restored.detailPage);
      if (
        !prior.applyIntent ||
        prior.operation?.state === "completed" ||
        prior.operation?.state === "expired"
      ) {
        const restoreId =
          invalidated !== undefined && restored.operation === invalidated
            ? null
            : restored.operation;
        setOperationId(restoreId);
        setAttendanceIntent(Boolean(restoreId && restored.attendanceIntent));
        setOperation(null);
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // Read the current controller and scope when Back/Forward fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attendanceController, actorUserId]);
  function updateFilter(next: Partial<ActivityUiFilters>) {
    listState.changeFilter({
      ...next,
      ...(("from" in next || "until" in next) && !next.date_scope
        ? { date_scope: "custom" as const }
        : {}),
    });
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
      invalidateUnsubmittedAttendance(null, detailPage, data.operation.id);
      setOperation(data.operation);
      setOperationId(data.operation.id);
      setAttendanceIntent(false);
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
      void refreshVolunteerQueries(cache, "activity", language);
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
      void refreshVolunteerQueries(cache, "activity", language);
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
  const loadError = list.error ?? templates.error ?? restored.error;
  const failure = [choose.error, preview.error, apply.error, sequence.error, refresh.error].find(
    Boolean,
  );
  const error = failure ? (volunteerAdminErrorMessage(failure, language) ?? "") : "";
  const rows = list.isError || rangeProblem ? [] : (list.data?.activities ?? []);
  const scheduleRows = view === "calendar" ? calendar.activities : rows;
  const total = rangeProblem ? 0 : (list.data?.total ?? 0);
  const listRefreshing = list.isFetching || listState.isDebouncing || list.isPlaceholderData;
  const review = operation ? reviewBulkOperation(operation) : null;
  const templateList = templates.data?.templates ?? [];
  const templateNames = Object.fromEntries(
    templateList.map((template) => [template.template_key, template.name]),
  );
  const previewDisabled =
    preview.isPending ||
    sequence.isPending ||
    ["applying", "outcome_unknown"].includes(attendanceState.phase) ||
    (draft.mode !== "generate" && draft.mode !== "copy" && !selection) ||
    (draft.mode === "copy" && !selection);
  const returnParams = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  );
  routeState.write(returnParams, listState.filters, page);
  returnParams.set("return_from", initialView === "calendar" ? "calendar" : "activities");
  const returnPosition = useVolunteerReturnPosition({
    listKey: "volunteer-workspace",
    actorUserId:
      cache.getQueryData?.<AdminMeResponse>(ADMIN_IDENTITY_QUERY_KEY)?.admin.authUserId ?? "",
    scopeKey: JSON.stringify([filter, page, selected, detailPage]),
    ready: Boolean(selected && detail.data) && !detail.isFetching && !detail.isError,
  });
  function shift(days: number) {
    if (listState.filters.date_scope !== "future") return;
    const start = filter.from ?? hkDate();
    updateFilter({
      date_scope: "future",
      from: addHkDays(start, days),
      until: addHkDays(filter.until ?? addHkDays(start, 30), days),
    });
  }
  return (
    <div className="space-y-6">
      <VolunteerPageHeading pageId={initialView === "calendar" ? "calendar" : "activities"}>
        <div>
          <h1 className="text-2xl font-bold">
            {initialView === "calendar" ? copy.calendarTitle : copy.title}
          </h1>
          <p>{copy.intro}</p>
        </div>
        <a className={button} href="/admin/volunteers/settings">
          {copy.policyLink}
        </a>
      </VolunteerPageHeading>
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
              {uniqueTemplates(templateList).map((t) => (
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
          onClick={() => updateFilter({ date_scope: "custom", from: hkDate(), until: hkDate() })}
        >
          {copy.filters.today}
        </button>
        <button
          className={button}
          onClick={() =>
            updateFilter({ date_scope: "future", from: hkDate(), until: addHkDays(hkDate(), 30) })
          }
        >
          {copy.filters.next30}
        </button>
        <button
          className={button}
          disabled={listState.filters.date_scope !== "future"}
          onClick={() => shift(-30)}
        >
          {copy.filters.previous}
        </button>
        <button
          className={button}
          disabled={listState.filters.date_scope !== "future"}
          onClick={() => shift(30)}
        >
          {copy.filters.next}
        </button>
        <button
          className={button}
          onClick={() =>
            updateFilter({
              date_scope: "history",
              from: undefined,
              until: addHkDays(hkDate(), -1),
              sort: "desc",
            })
          }
        >
          {copy.filters.past}
        </button>
        <button
          className={button}
          onClick={() => updateFilter({ date_scope: "all", from: undefined, until: undefined })}
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
      {loadError ? (
        <LoadFailure
          error={loadError}
          onRetry={() => {
            if (!rangeProblem) void list.refetch();
            void templates.refetch();
            if (operationId && actorUserId) void restored.refetch();
          }}
          title={volunteerAdminErrorMessage(loadError, language) ?? undefined}
          retryLabel={copy.reload}
        />
      ) : null}
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
      {(attendanceState.operationId || attendanceState.previewKey) &&
        (!selected ||
          attendanceState.operation?.activity_id !== selected ||
          attendanceState.operation?.scope.page !== detailPage) && (
          <ActivityAttendanceRecovery
            state={attendanceState}
            controller={attendanceController}
            actorUserId={actorUserId}
            onClearOperation={clearAttendanceOperation}
            onOpenOriginal={openOriginalAttendance}
            selectedActivityId={selected ?? undefined}
            selectedPage={detailPage}
          />
        )}
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
            {view === "calendar"
              ? copy.list.selectCalendarPage(page, rows.length)
              : copy.list.selectPage(rows.length)}
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
        {rangeProblem ? (
          <p role="status">{copy.schedule.rangeProblems[rangeProblem]}</p>
        ) : view === "calendar" ? (
          <>
            <p role="status" aria-live="polite">
              {list.isFetching
                ? copy.list.loading
                : list.isError
                  ? copy.schedule.partialFailure(calendar.loaded)
                  : calendar.changed
                    ? copy.schedule.changed
                    : calendar.complete
                      ? copy.schedule.complete(calendar.loaded)
                      : copy.schedule.partial(calendar.loaded, calendar.total)}
            </p>
            {calendar.changed && (
              <button
                className={button}
                onClick={() => {
                  setCalendarPages(null);
                  if (page !== 1) setPage(1);
                  else void list.refetch();
                }}
              >
                {copy.reload}
              </button>
            )}
            {calendar.complete && calendar.total === 0 ? (
              <p>{copy.list.noMatch}</p>
            ) : (
              <ActivitySchedule
                rows={scheduleRows}
                view={view}
                from={filter.from}
                until={filter.until}
                complete={calendar.complete && !list.isError && !list.isFetching}
                ids={ids}
                templateNames={templateNames}
                onToggle={(id, checked) => {
                  if (listRefreshing || list.isError) return;
                  setIds(checked ? [...ids, id] : ids.filter((value) => value !== id));
                  setSelection(null);
                }}
                onOpen={(id) => {
                  invalidateUnsubmittedAttendance(id, 1);
                  setSelected(id);
                  setDetailPage(1);
                  setHistoryPage(1);
                }}
              />
            )}
          </>
        ) : list.isPending ? (
          <p role="status">{copy.list.loading}</p>
        ) : list.isError ? ( // admin-load-failure-ok: the LoadFailure above names the failure; this line only stands in for the list
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
              invalidateUnsubmittedAttendance(id, 1);
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
        returnState={readActivityReturnState(returnParams)}
        onRegistrationOpen={(id) => returnPosition.remember(`registration-${id}`)}
        attendanceRecovery={
          <ActivityAttendanceRecovery
            state={attendanceState}
            controller={attendanceController}
            actorUserId={actorUserId}
            onClearOperation={clearAttendanceOperation}
            onOpenOriginal={openOriginalAttendance}
            selectedActivityId={selected ?? undefined}
            selectedPage={detailPage}
          />
        }
        attendance={
          detail.data && (
            <ActivityAttendancePanel
              detail={detail.data}
              page={detailPage}
              actorUserId={actorUserId}
              state={attendanceState}
              controller={attendanceController}
              refreshing={
                detail.isFetching ||
                Boolean(
                  operationId &&
                  operation?.id !== operationId &&
                  attendanceState.operationId !== operationId,
                )
              }
              onReload={async () => {
                const result = await detail.refetch();
                if (result.error) throw result.error;
                return result.data;
              }}
              onClearOperation={clearAttendanceOperation}
              onOpenOriginal={openOriginalAttendance}
              returnState={readActivityReturnState(returnParams)}
              onRegistrationOpen={(id) => returnPosition.remember(`registration-${id}`)}
            />
          )
        }
        open={Boolean(selected)}
        onClose={() => {
          setSelected(null);
          tableHeading.current?.focus();
        }}
        detail={detail}
        detailPage={detailPage}
        historyPage={historyPage}
        onDetailPage={changeDetailPage}
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
