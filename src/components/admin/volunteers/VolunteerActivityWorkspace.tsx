import { ActivitySchedule } from "./ActivitySchedule";
import { volunteerErrorMessage } from "../../../lib/volunteers/apiResult";
import { VolunteerDraftForm } from "./VolunteerDraftForm";
import { useEffect, useMemo, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import {
  parseListPage,
  useListQueryState,
  type ListRouteState,
} from "../../../lib/admin/useListQueryState";
import {
  activityFilterSchema,
  addHkDays,
  generationDates,
  hkDate,
  hkTimeLabel,
  type ActivityFilter,
} from "../../../lib/volunteers/bulk/service";
import { applyReviewedGroups, reviewBulkOperation } from "../../../lib/volunteers/bulk/review";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "../../ui/sheet";

export type Row = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  status: string;
  capacity: number;
  template_key: string | null;
  shelter_key: string | null;
  policy_version_id: string | null;
  policy_revision: number;
  updated_at: string;
  scenario: string | null;
  approved: number;
  waitlisted: number;
  shortages: { role: string; missing: number }[];
  registrations_closed_at: string | null;
};
type Item = Partial<Row> & {
  date: string;
  template_key: string;
  item_key: string;
  state: string;
  preview: {
    kind: string;
    reason?: string;
    after?: { title: string; starts_at: string; shelter_key: string; capacity: number };
    issues?: string[];
    registrations?: { kind: string; reason?: string }[];
  };
  result?: { kind: string };
};
type Group = { index: number; date: string; state: string; reason?: string; items: Item[] };
type Operation = {
  notifications?: {
    id: string;
    kind: string;
    queue_status: string;
    follow_up: string;
    completed_at: string | null;
    provider_message_id: string | null;
  }[];
  id: string;
  action: string;
  selection: Row[];
  groups: Group[];
  created_at: string;
  expires_at: string;
};
type Template = {
  template_key: string;
  name: string;
  version_id: string;
  shelter: string;
  start_time: string;
  end_time: string;
};
type Reply = { kind: string; operation: Operation };
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
const operationLabels = {
  generate: "批量產生活動",
  copy: "複製至指定日期",
  edit: "編輯說明",
  rebind: "套用已發布政策",
  close: "截止報名",
  cancel: "取消活動",
  attendance: "出席紀錄",
};
const labels: Record<string, string> = {
  pending: "待確認執行",
  ready: "可執行",
  applied: "已完成",
  skipped: "已略過",
  conflicted: "資料已變更，須重新預覽",
  failed: "未完成，可重試",
  draft: "草稿",
  published: "已發布",
  cancelled: "已取消",
  completed: "已完成",
  closed: "已結束",
  confirmed_group: "已確認團體",
  no_confirmed_group: "未有已確認團體",
};
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
export function VolunteerActivityWorkspace({ initialView }: { initialView?: "calendar" } = {}) {
  const [state] = useState(initial);
  const listState = useListQueryState<ActivityFilter>({
    key: "volunteer-workspace",
    initialFilters: { ...state.filter, q: "" },
    initialPage: state.page,
    routeState: ACTIVITY_ROUTE,
    onScopeChange: () => {
      setIds([]);
      setSelection(null);
      setNotice("篩選已變更，已清除跨頁選取。");
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
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<keyof typeof operationLabels>("generate");
  const [template, setTemplate] = useState("");
  const [templateKeys, setTemplateKeys] = useState<string[]>([]);
  const [from, setFrom] = useState(hkDate());
  const [until, setUntil] = useState(addHkDays(hkDate(), 27));
  const [weekdays, setWeekdays] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [excluded, setExcluded] = useState("");
  const [reason, setReason] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [attendance, setAttendance] = useState("attended");
  const [correction, setCorrection] = useState(false);
  const [reviewed, setReviewed] = useState<number[]>([]);
  const [reviewAll, setReviewAll] = useState(false);
  const [localError, setLocalError] = useState("");
  const [showOperation, setShowOperation] = useState(false);
  const cache = useQueryClient();
  const tableHeading = useRef<HTMLHeadingElement>(null);
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
      call<{
        activity: Row & { description: string | null };
        registrations: {
          id: string;
          contact_name: string;
          status: string;
          attendance_status: string;
        }[];
        total: number;
        history_total: number;
        history: { id: string; action: string; created_at: string }[];
      }>({ action: "detail", activity_id: selected, page: detailPage, history_page: historyPage }),
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
      setNotice(`已鎖定 ${data.operation.selection.length} 場活動；新增符合條件的活動不會加入。`);
    },
  });
  const preview = useMutation({
    mutationFn: async () => {
      setLocalError("");
      const dates = generationDates(
        from,
        until,
        weekdays,
        excluded.split(/[\s,，]+/).filter(Boolean),
      );
      let input: unknown;
      if (mode === "generate") input = { template_keys: templateKeys, dates };
      else if (mode === "copy")
        input = {
          source_id: selection?.selection[0]?.id,
          template_key: template || undefined,
          dates,
        };
      else if (mode === "edit")
        input = {
          changes: { ...(title ? { title } : {}), ...(description ? { description } : {}) },
        };
      else if (mode === "rebind") input = { version_id: template, reason };
      else if (mode === "attendance")
        input = {
          attendance_status: attendance,
          command: correction ? "correct" : "record",
          ...(reason ? { reason } : {}),
        };
      else input = { reason };
      return call<Reply>({
        action: "preview",
        operation: mode,
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
      setNotice(
        halted
          ? "順序執行已停止；請先更新進度。失敗組可按原操作重試，衝突組須重新預覽。"
          : "所有已審閱草稿組已順序完成。",
      );
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
  const error =
    localError ||
    [
      list.error,
      templates.error,
      choose.error,
      preview.error,
      apply.error,
      sequence.error,
      refresh.error,
      restored.error,
    ].find(Boolean)?.message;
  const rows = list.isError ? [] : (list.data?.activities ?? []);
  const total = list.data?.total ?? 0;
  const listRefreshing = list.isFetching || listState.isDebouncing || list.isPlaceholderData;
  const review = operation ? reviewBulkOperation(operation) : null;
  const policyName = (item: Item) =>
    templates.data?.templates.find(
      (candidate) =>
        candidate.version_id === item.policy_version_id ||
        candidate.template_key === item.template_key,
    )?.name ?? (item.policy_version_id ? "政策版本待核對" : "未綁定政策");
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
          <h1 className="text-2xl font-bold">義工活動工作台</h1>
          <p>按香港時間管理場次、報名及出席紀錄。</p>
        </div>
        <a className={button} href="/admin/volunteers/settings">
          政策設定及待確認規則
        </a>
      </header>
      <VolunteerDraftForm />
      <section aria-label="活動篩選" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <label className="col-span-2 sm:col-span-1">
          搜尋名稱或地點
          <input className={control + " w-full"} {...listState.queryInput} />
        </label>
        <label>
          由
          <input
            type="date"
            className={control + " w-full"}
            value={filter.from ?? ""}
            onChange={(e) => updateFilter({ from: e.target.value || undefined })}
          />
        </label>
        <label>
          至
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
          更多篩選{activeAdvancedFilters > 0 ? `（${activeAdvancedFilters} 項已啟用）` : ""}
        </button>
        <div
          id="advanced-activity-filters"
          className={
            (advancedFiltersOpen ? "grid" : "hidden") +
            " col-span-2 gap-3 sm:col-span-3 sm:grid sm:grid-cols-3"
          }
        >
          <label>
            收容所
            <input
              className={control + " w-full"}
              value={filter.shelter ?? ""}
              onChange={(e) => updateFilter({ shelter: e.target.value })}
            />
          </label>
          <label>
            模板
            <select
              className={control + " w-full"}
              value={filter.template ?? ""}
              onChange={(e) => updateFilter({ template: e.target.value })}
            >
              <option value="">全部模板</option>
              {Array.from(
                new Map((templates.data?.templates ?? []).map((t) => [t.template_key, t])).values(),
              ).map((t) => (
                <option key={t.template_key} value={t.template_key}>
                  {t.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            狀態
            <select
              className={control + " w-full"}
              value={filter.status ?? ""}
              onChange={(e) => updateFilter({ status: e.target.value as ActivityFilter["status"] })}
            >
              <option value="">全部狀態</option>
              {["draft", "published", "cancelled", "closed"].map((s) => (
                <option key={s} value={s}>
                  {labels[s]}
                </option>
              ))}
            </select>
          </label>
          <label>
            團體安排
            <select
              className={control + " w-full"}
              value={filter.scenario ?? ""}
              onChange={(e) =>
                updateFilter({ scenario: e.target.value as ActivityFilter["scenario"] })
              }
            >
              <option value="">全部安排</option>
              <option value="confirmed_group">已確認團體</option>
              <option value="no_confirmed_group">未有已確認團體</option>
            </select>
          </label>
          <label>
            政策
            <select
              className={control + " w-full"}
              value={filter.readiness ?? ""}
              onChange={(e) =>
                updateFilter({ readiness: e.target.value as ActivityFilter["readiness"] })
              }
            >
              <option value="">全部</option>
              <option value="ready">已綁定政策</option>
              <option value="missing">待綁定政策</option>
            </select>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={filter.shortage ?? false}
              onChange={(e) => updateFilter({ shortage: e.target.checked })}
            />
            未達政策最低人手
          </label>
        </div>
      </section>
      <div className="flex flex-wrap gap-2">
        <button
          className={button}
          onClick={() => updateFilter({ from: hkDate(), until: addHkDays(hkDate(), 30) })}
        >
          今天起30天
        </button>
        <button className={button} onClick={() => shift(-30)}>
          上一期
        </button>
        <button className={button} onClick={() => shift(30)}>
          下一期
        </button>
        <button
          className={button}
          onClick={() =>
            updateFilter({ from: undefined, until: addHkDays(hkDate(), -1), sort: "desc" })
          }
        >
          歷史活動
        </button>
        <button
          className={button}
          onClick={() => updateFilter({ from: undefined, until: undefined })}
        >
          所有日期
        </button>
        <button
          className={button}
          onClick={() => setView(view === "calendar" ? "table" : "calendar")}
        >
          {view === "calendar" ? "列表檢視" : "月曆檢視"}
        </button>
        <label>
          排序{" "}
          <select
            className={control}
            value={filter.sort}
            onChange={(e) => updateFilter({ sort: e.target.value as "asc" | "desc" })}
          >
            <option value="asc">日期由早至晚</option>
            <option value="desc">日期由晚至早</option>
          </select>
        </label>
      </div>
      {error && (
        <div role="alert" className="rounded border border-[var(--color-error)] p-3">
          {error}
          <button
            className={button}
            onClick={() => {
              void list.refetch();
              void templates.refetch();
            }}
          >
            重新載入
          </button>
        </div>
      )}
      <p role="status">{notice}</p>
      <section aria-label="活動列表">
        <h2 ref={tableHeading} tabIndex={-1} className="text-lg font-bold">
          1. 選範圍 · 活動（{list.isError ? "資料暫不可用" : total}）
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
            選取本頁（{rows.length}）
          </button>
          <button
            className={button}
            disabled={!ids.length || choose.isPending || listRefreshing || list.isError}
            onClick={() => choose.mutate(false)}
          >
            鎖定已選跨頁項目（{ids.length}）
          </button>
          <button
            className={button}
            disabled={!total || choose.isPending || listRefreshing || list.isError}
            onClick={() => choose.mutate(true)}
          >
            鎖定所有符合條件（{total}）
          </button>
          <button
            className={button}
            onClick={() => {
              setIds([]);
              setSelection(null);
            }}
          >
            清除選取
          </button>
          <span>已鎖定 {selection?.selection.length ?? 0} 場</span>
          {selection && (
            <span className="text-sm">
              快照 {hkTimeLabel(selection.created_at)} 建立；{hkTimeLabel(selection.expires_at)}
              前有效。新增符合條件的活動不會加入。
            </span>
          )}
        </div>
        {listRefreshing && list.data ? <p role="status">正在更新活動…</p> : null}
        {list.isPending ? (
          <p role="status">正在載入活動…</p>
        ) : list.isError ? (
          <p>活動列表暫不可用，請重新載入。</p>
        ) : !rows.length ? (
          <p>
            {filter.q || filter.shelter || filter.template
              ? "沒有符合篩選的活動，請調整條件。"
              : "這段日期尚未有活動，可從已發布模板產生新場次。"}
          </p>
        ) : (
          <ActivitySchedule
            rows={rows}
            view={view}
            from={filter.from}
            until={filter.until}
            ids={ids}
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
            上一頁
          </button>
          <span>
            第 {page} / {Math.max(1, Math.ceil(total / 25))} 頁
          </span>
          <button
            className={button}
            disabled={page * 25 >= total || listRefreshing || list.isError}
            onClick={() => setPage((p) => p + 1)}
          >
            下一頁
          </button>
        </div>
      </section>
      <section
        className="space-y-3 rounded-lg border border-[var(--color-border)] p-4"
        aria-label="批量操作"
      >
        <h2 className="text-lg font-bold">2. 預覽差異及例外</h2>
        <label>
          操作{" "}
          <select
            aria-label="操作"
            className={control}
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as keyof typeof operationLabels);
              setTemplate("");
            }}
          >
            {Object.entries(operationLabels).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {mode === "generate" && (
          <fieldset className="space-y-2">
            <legend>選取已發布模板（可多選）</legend>
            {Array.from(
              new Map((templates.data?.templates ?? []).map((t) => [t.template_key, t])).values(),
            ).map((t) => (
              <label key={t.template_key} className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={templateKeys.includes(t.template_key)}
                  onChange={(e) =>
                    setTemplateKeys(
                      e.target.checked
                        ? [...templateKeys, t.template_key]
                        : templateKeys.filter((k) => k !== t.template_key),
                    )
                  }
                />
                {t.name} · {t.shelter} · {t.start_time}–{t.end_time}
              </label>
            ))}
          </fieldset>
        )}
        {["copy", "rebind"].includes(mode) && (
          <label className="block">
            已發布模板／政策{" "}
            <select
              className={control}
              value={template}
              onChange={(e) => setTemplate(e.target.value)}
            >
              <option value="">請選擇{mode === "copy" ? "（可沿用來源模板）" : ""}</option>
              {(templates.data?.templates ?? []).map((t) => (
                <option
                  key={t.version_id}
                  value={mode === "rebind" ? t.version_id : t.template_key}
                >
                  {t.name} · {t.shelter} · {t.start_time}–{t.end_time}
                </option>
              ))}
            </select>
          </label>
        )}
        {["generate", "copy"].includes(mode) && (
          <div className="space-y-2">
            <p>
              每個日期按有效政策產生新編號；不複製報名、同意紀錄或出席歷史。複製功能使用第一個鎖定場次。
            </p>
            <label>
              開始{" "}
              <input
                type="date"
                className={control}
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>{" "}
            <label>
              結束{" "}
              <input
                type="date"
                className={control}
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
            <button className={button} onClick={() => setUntil(addHkDays(from, 27))}>
              四星期
            </button>
            <button className={button} onClick={() => setUntil(addHkDays(from, 55))}>
              八星期
            </button>
            <fieldset className="flex flex-wrap gap-3">
              <legend>星期</legend>
              {["日", "一", "二", "三", "四", "五", "六"].map((label, n) => (
                <label key={n}>
                  <input
                    type="checkbox"
                    checked={weekdays.includes(n)}
                    onChange={(e) =>
                      setWeekdays(
                        e.target.checked ? [...weekdays, n] : weekdays.filter((v) => v !== n),
                      )
                    }
                  />{" "}
                  星期{label}
                </label>
              ))}
            </fieldset>
            <label className="block">
              排除日期（YYYY-MM-DD，以逗號分隔）
              <input
                className={control + " w-full"}
                value={excluded}
                onChange={(e) => setExcluded(e.target.value)}
              />
            </label>
          </div>
        )}
        {mode === "edit" && (
          <>
            <p>
              只修改標題及說明。容量、資格及政策須選「套用已發布政策」並檢查現有報名影響；時間及收容所變更須在政策設定預覽。
            </p>
            <label className="block">
              新標題
              <input
                className={control + " w-full"}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </label>
            <label className="block">
              新說明
              <textarea
                className={control + " w-full"}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
          </>
        )}
        {mode === "attendance" && (
          <div className="flex flex-wrap gap-3">
            <label>
              出席狀態
              <select
                className={control}
                value={attendance}
                onChange={(e) => setAttendance(e.target.value)}
              >
                <option value="attended">已出席</option>
                <option value="completed">已完成服務</option>
                <option value="no_show">未有出席</option>
                <option value="not_marked">未記錄（須更正）</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={correction}
                onChange={(e) => setCorrection(e.target.checked)}
              />
              更正已有紀錄（保留原因及歷史）
            </label>
          </div>
        )}
        {!["generate", "copy", "edit"].includes(mode) && (
          <label className="block">
            操作原因
            <input
              className={control + " w-full"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
        )}
        <button
          className={button}
          disabled={
            preview.isPending ||
            sequence.isPending ||
            (mode !== "generate" && mode !== "copy" && !selection) ||
            (mode === "copy" && !selection)
          }
          onClick={() => preview.mutate()}
        >
          預覽影響
        </button>
        <p>待決定的營運規則不能發布。團體查詢／待確認安排不等於已確認團體。</p>
      </section>
      {operation && (
        <section className="space-y-3" aria-label="操作進度">
          <div className="flex gap-2">
            <h2 className="text-lg font-bold">
              3. 執行結果 · {operationLabels[operation.action as keyof typeof operationLabels]}
            </h2>
            <button className={button} onClick={() => setShowOperation((v) => !v)}>
              {showOperation ? "收起" : "展開"}預覽
            </button>
            <button className={button} onClick={() => refresh.mutate()}>
              更新進度
            </button>
          </div>
          <p>
            已儲存快照：{hkTimeLabel(operation.created_at)}；{hkTimeLabel(operation.expires_at)}
            前有效。每組獨立交易，同一天不拆組；執行時會重新檢查權限、政策與版本。
            關閉頁面後可用本頁網址返回；先更新進度再重試。
          </p>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt>可執行項目</dt>
              <dd className="font-bold">{review?.eligible ?? 0}</dd>
            </div>
            <div>
              <dt>略過項目</dt>
              <dd className="font-bold">{review?.skipped ?? 0}</dd>
            </div>
            <div>
              <dt>版本衝突</dt>
              <dd className="font-bold">{review?.conflicted ?? 0}</dd>
            </div>
            <div>
              <dt>失敗項目／組</dt>
              <dd className="font-bold">{review?.failed ?? 0}</dd>
            </div>
          </dl>
          {review?.canRunSequentially ? (
            <div className="rounded-lg border border-[var(--color-border)] p-3">
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={reviewAll}
                  onChange={(event) => setReviewAll(event.target.checked)}
                />
                已檢查餘下 {operation.groups.filter((group) => group.state === "pending").length}{" "}
                組新草稿的日期、政策、容量和例外
              </label>
              <button
                className={button}
                disabled={!reviewAll || sequence.isPending || apply.isPending}
                onClick={() => sequence.mutate()}
              >
                {sequence.isPending ? "順序執行中…" : "順序執行已審閱組"}
              </button>
              <p className="text-sm">
                每組仍逐一呼叫既有交易；遇到衝突、失敗或網絡不確定會停止並讀取狀態。
              </p>
            </div>
          ) : (
            <p className="text-sm">取消、關閉、政策或容量影響、出席更正及有例外的組須逐組審閱。</p>
          )}
          {operation.groups.some((group) => group.state === "conflicted") && (
            <p role="alert">有組別已變更，請重新鎖定範圍並預覽；不要重用舊預覽。</p>
          )}
          <details className="text-sm">
            <summary className="cursor-pointer">操作技術詳情</summary>
            <p>操作編號 {operation.id}；最多 100 場。同一天的項目在同一組。</p>
          </details>
          <div aria-label="通知及跟進狀態">
            {operation.notifications?.length ? (
              operation.notifications.map((n) => (
                <p key={n.id}>
                  {n.kind === "volunteer_operation_changed" ? "職員跟進" : "通知"}：
                  {n.queue_status === "delivered"
                    ? "已送達"
                    : n.queue_status === "failed"
                      ? "處理失敗"
                      : n.follow_up === "completed"
                        ? "已完成跟進"
                        : n.provider_message_id
                          ? "供應商已接收（未代表送達）"
                          : n.queue_status === "queued"
                            ? "排隊中"
                            : "待跟進"}
                  {n.completed_at ? ` · ${hkTimeLabel(n.completed_at)}` : ""}
                </p>
              ))
            ) : (
              <p>此操作暫無通知或跟進紀錄。</p>
            )}
          </div>
          {showOperation &&
            operation.groups.map((g) => (
              <section key={g.index} className="rounded border border-[var(--color-border)] p-3">
                <h3 className="font-bold">
                  第 {g.index + 1} 組 · {g.date} · {g.items.length} 場 ·{" "}
                  {labels[g.state] ?? g.state}
                </h3>
                {g.reason && <p role="alert">{volunteerErrorMessage({ reason: g.reason }, 409)}</p>}
                <ul>
                  {g.items.map((i) => (
                    <li key={i.item_key} className="border-b border-[var(--color-border)] py-3">
                      <p className="font-medium">
                        {i.starts_at ? hkTimeLabel(i.starts_at) : i.date} ·{" "}
                        {i.title ?? policyName(i)}
                      </p>
                      <p className="text-sm">
                        政策：{policyName(i)} · {labels[i.state] ?? i.state} ·{" "}
                        {i.approved === undefined
                          ? "受影響報名人數待核對"
                          : "受影響已確認報名 " + i.approved + " 人"}
                      </p>
                      <p className="text-sm">
                        容量：{i.capacity ?? "未有現值"} →{" "}
                        {i.preview.after?.capacity ?? i.capacity ?? "未有預覽值"}
                      </p>
                      {i.preview.after && (
                        <p className="text-sm">
                          套用後：{i.preview.after.title} · {hkTimeLabel(i.preview.after.starts_at)}
                          · {i.preview.after.shelter_key} · 容量 {i.preview.after.capacity}
                        </p>
                      )}
                      {i.preview.reason && (
                        <p role="alert">{volunteerErrorMessage(i.preview, 422)}</p>
                      )}
                      {i.preview.issues?.length ? (
                        <p role="alert">
                          {i.preview.issues
                            .map((reason) => volunteerErrorMessage({ reason }, 422))
                            .join("、")}
                        </p>
                      ) : null}
                      {i.preview.registrations && (
                        <p className="text-sm">
                          出席可更新{" "}
                          {i.preview.registrations.filter((r) => r.kind === "applied").length}
                          、略過{" "}
                          {i.preview.registrations.filter((r) => r.kind === "skipped").length}
                        </p>
                      )}
                      <details className="text-sm">
                        <summary className="cursor-pointer">項目技術詳情</summary>
                        <p>
                          項目 {i.item_key} · 模板 {i.template_key} · 政策版本{" "}
                          {i.policy_version_id ?? "未綁定"}
                        </p>
                        {i.result && <p>交易結果：{labels[i.result.kind] ?? i.result.kind}</p>}
                      </details>
                    </li>
                  ))}
                </ul>
                {["pending", "failed"].includes(g.state) && (
                  <div className="mt-3 flex flex-wrap gap-3">
                    <label>
                      <input
                        type="checkbox"
                        checked={reviewed.includes(g.index)}
                        onChange={(e) =>
                          setReviewed(
                            e.target.checked
                              ? [...reviewed, g.index]
                              : reviewed.filter((n) => n !== g.index),
                          )
                        }
                      />
                      已檢查本組每個日期及影響
                    </label>
                    <button
                      className={button}
                      disabled={
                        !reviewed.includes(g.index) || apply.isPending || sequence.isPending
                      }
                      onClick={() => apply.mutate(g.index)}
                    >
                      {g.state === "failed" ? "以原操作重試" : "執行此組"}
                    </button>
                  </div>
                )}
              </section>
            ))}
        </section>
      )}
      <Sheet
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) {
            setSelected(null);
            tableHeading.current?.focus();
          }
        }}
      >
        <SheetContent className="w-full overflow-y-auto sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>{detail.data?.activity.title ?? "活動詳情"}</SheetTitle>
            <SheetDescription>
              查看活動、報名、出席及操作歷史；關閉後保留篩選與頁碼。
            </SheetDescription>
          </SheetHeader>
          {detail.isPending ? (
            <p role="status">正在載入詳情…</p>
          ) : detail.isError ? (
            <p role="alert">
              {detail.error.message}
              <button className={button} onClick={() => void detail.refetch()}>
                重試
              </button>
            </p>
          ) : (
            detail.data && (
              <div className="space-y-4">
                <p>
                  {hkTimeLabel(detail.data.activity.starts_at)} · {detail.data.activity.location}
                </p>
                <p>{detail.data.activity.description}</p>
                <button
                  className={button}
                  onClick={() => {
                    setIds([detail.data!.activity.id]);
                    setMode("edit");
                    setTitle(detail.data!.activity.title);
                    setDescription(detail.data!.activity.description ?? "");
                    setSelected(null);
                    setNotice("已選取此活動，請鎖定選取後預覽修改。");
                  }}
                >
                  編輯此活動
                </button>
                <h3 className="font-bold">報名及出席（{detail.data.total}）</h3>
                {detail.data.registrations.map((r) => (
                  <p key={r.id}>
                    {r.contact_name} · {r.status} · {r.attendance_status}
                  </p>
                ))}
                <button
                  className={button}
                  disabled={detailPage === 1}
                  onClick={() => setDetailPage((p) => p - 1)}
                >
                  上一頁報名
                </button>
                <button
                  className={button}
                  disabled={detailPage * 25 >= detail.data.total}
                  onClick={() => setDetailPage((p) => p + 1)}
                >
                  下一頁報名
                </button>
                <h3 className="font-bold">操作紀錄（{detail.data.history_total}）</h3>
                {detail.data.history.map((h) => (
                  <p key={h.id}>
                    {hkTimeLabel(h.created_at)} · {h.action}
                  </p>
                ))}
                <div className="flex gap-2">
                  <button
                    className={button}
                    disabled={historyPage === 1}
                    onClick={() => setHistoryPage((p) => p - 1)}
                  >
                    上一頁紀錄
                  </button>
                  <span>第{historyPage}頁</span>
                  <button
                    className={button}
                    disabled={historyPage * 25 >= detail.data.history_total}
                    onClick={() => setHistoryPage((p) => p + 1)}
                  >
                    下一頁紀錄
                  </button>
                </div>
              </div>
            )
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
