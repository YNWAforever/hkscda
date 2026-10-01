import { ContentReviewQueue } from "./ContentReview";
import { useMemo, useState, type InputHTMLAttributes } from "react";
import { Edit3, Filter, RefreshCw, Search } from "lucide-react";
import { Link, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";

import type {
  ContentStatus,
  ContentSummary,
  ContentType,
  NotificationDraftStatus,
} from "../../../lib/content/types";
import { fetchAdminJson } from "../../../lib/admin/http";
import {
  parseListPage,
  useListQueryState,
  type ListRouteState,
} from "../../../lib/admin/useListQueryState";
import { DataTable, type DataTableColumn } from "../DataTable";
import { STAT_UNAVAILABLE } from "../LoadFailure";
import { TablePager } from "../TablePager";
import { StatusPill, type StatusTone } from "../StatusBadge";
import {
  buildContentSearchParams,
  contentStatusTone,
  formatContentTypeLabel,
  summarizeContentRows,
} from "./contentAdminLogic";

export type ContentListResponse = {
  content: ContentSummary[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    pageCount: number;
  };
};

type AdminContentListApiResponse = {
  items: ContentSummary[];
  total: number;
};

type ContentManagementProps = {
  initialData?: ContentListResponse;
};

const contentTypeOptions: Array<ContentType | "all"> = [
  "all",
  "rescue_story",
  "event",
  "charity_market",
  "report",
];
const contentStatusOptions: Array<ContentStatus | "all"> = [
  "all",
  "draft",
  "published",
  "archived",
];

const statusLabels: Record<ContentStatus, string> = {
  draft: "草稿",
  published: "已發布",
  archived: "已封存",
};

const toneMap: Record<ReturnType<typeof contentStatusTone>, StatusTone> = {
  success: "success",
  warning: "warning",
  muted: "neutral",
};

type ContentFilters = {
  type: ContentType | "all";
  status: ContentStatus | "all";
  rescueRegion: string;
  publishedFrom: string;
  publishedTo: string;
  mapVisibility: "all" | "on" | "off";
  hasUpdate: "all" | "yes" | "no";
  draftState: "all" | NotificationDraftStatus;
};
const CONTENT_ROUTE: ListRouteState<ContentFilters> = {
  key: "admin-content",
  read(params, defaults) {
    const type = params.get("type");
    const status = params.get("status");
    const map = params.get("map");
    const update = params.get("hasUpdate");
    const draft = params.get("draftState");
    const date = (value: string | null) =>
      value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
    return {
      filters: {
        ...defaults,
        type: contentTypeOptions.includes(type as ContentType) ? (type as ContentType) : "all",
        status: contentStatusOptions.includes(status as ContentStatus)
          ? (status as ContentStatus)
          : "all",
        publishedFrom: date(params.get("publishedFrom")),
        publishedTo: date(params.get("publishedTo")),
        mapVisibility: map === "on" || map === "off" ? map : "all",
        hasUpdate: update === "yes" || update === "no" ? update : "all",
        draftState:
          draft === "draft" ||
          draft === "copied" ||
          draft === "sent_manually" ||
          draft === "dismissed"
            ? draft
            : "all",
      },
      page: parseListPage(params.get("page")),
    };
  },
  write(params, filters, page) {
    for (const [key, value] of [
      ["type", filters.type],
      ["status", filters.status],
      ["publishedFrom", filters.publishedFrom],
      ["publishedTo", filters.publishedTo],
      ["map", filters.mapVisibility],
      ["hasUpdate", filters.hasUpdate],
      ["draftState", filters.draftState],
    ] as const) {
      if (!value || value === "all") params.delete(key);
      else params.set(key, value);
    }
    if (page === 1) params.delete("page");
    else params.set("page", String(page));
    params.delete("rescueRegion");
  },
};

export function ContentManagement({ initialData }: ContentManagementProps) {
  if (initialData) {
    return <ContentManagementView data={initialData} loading={false} />;
  }

  return <ContentManagementRuntime />;
}

function ContentManagementRuntime() {
  const qualityParam = new URLSearchParams(
    typeof window === "undefined" ? "" : window.location.search,
  ).get("quality");
  const initialQuality =
    qualityParam === "demo" || qualityParam === "expired" || qualityParam === "missing_source"
      ? qualityParam
      : "all";
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [createError, setCreateError] = useState("");
  const [creating, setCreating] = useState(false);
  async function createDraft(input: { type: ContentType; title: string; summary: string }) {
    setCreating(true);
    setCreateError("");
    try {
      const result = await fetchAdminJson<{ id: string }>("/api/admin/content", {
        method: "POST",
        body: JSON.stringify({
          ...input,
          slug: `${input.type.replaceAll("_", "-")}-${crypto.randomUUID()}`,
          status: "draft",
        }),
      });
      await navigate({ to: "/admin/content/$id", params: { id: result.id } });
    } catch {
      setCreateError("未能建立草稿，請檢查資料後重試。");
    } finally {
      setCreating(false);
    }
  }
  const listState = useListQueryState({
    key: "admin-content",
    initialFilters: {
      type: "all" as ContentFilters["type"],
      status: "all" as ContentFilters["status"],
      rescueRegion: "",
      publishedFrom: "",
      publishedTo: "",
      mapVisibility: "all" as ContentFilters["mapVisibility"],
      hasUpdate: "all" as ContentFilters["hasUpdate"],
      draftState: "all" as ContentFilters["draftState"],
    },
    routeState: CONTENT_ROUTE,
  });
  const { query, page, setPage, filters, changeFilter } = listState;
  const {
    type,
    status,
    rescueRegion,
    publishedFrom,
    publishedTo,
    mapVisibility,
    hasUpdate,
    draftState,
  } = filters;
  const search = useMemo(
    () =>
      buildContentSearchParams({
        q: query,
        type,
        status,
        rescueRegion,
        publishedFrom,
        publishedTo,
        mapVisibility,
        hasUpdate,
        draftState,
        page,
      }).toString(),
    [
      query,
      rescueRegion,
      status,
      type,
      publishedFrom,
      publishedTo,
      mapVisibility,
      hasUpdate,
      draftState,
      page,
    ],
  );

  const contentQuery = useQuery({
    queryKey: ["admin-content", search],
    queryFn: async ({ signal }) => {
      const response = await fetchAdminJson<AdminContentListApiResponse>(
        "/api/admin/content?" + search,
        { signal },
      );
      return normalizeListResponse(response, search);
    },
    enabled: listState.hydrated,
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <ContentReviewQueue key={initialQuality} initialQuality={initialQuality} />
      <CreateContentDraft onCreate={createDraft} busy={creating} error={createError} />
      <ContentManagementView
        data={contentQuery.data}
        loading={contentQuery.isLoading || !listState.hydrated}
        query={listState.draftQuery}
        queryInput={listState.queryInput}
        type={type}
        status={status}
        rescueRegion={rescueRegion}
        publishedFrom={publishedFrom}
        publishedTo={publishedTo}
        mapVisibility={mapVisibility}
        hasUpdate={hasUpdate}
        draftState={draftState}
        error={contentQuery.error instanceof Error ? contentQuery.error.message : null}
        onQueryChange={undefined}
        onTypeChange={(value) => changeFilter({ type: value })}
        onStatusChange={(value) => changeFilter({ status: value })}
        onRescueRegionChange={(value) => changeFilter({ rescueRegion: value })}
        onPublishedFromChange={(value) => changeFilter({ publishedFrom: value })}
        onPublishedToChange={(value) => changeFilter({ publishedTo: value })}
        onMapVisibilityChange={(value) => changeFilter({ mapVisibility: value })}
        onHasUpdateChange={(value) => changeFilter({ hasUpdate: value })}
        onDraftStateChange={(value) => changeFilter({ draftState: value })}
        onPageChange={setPage}
        fetching={contentQuery.isFetching || listState.isDebouncing}
        onRefresh={() => void queryClient.invalidateQueries({ queryKey: ["admin-content"] })}
      />
    </>
  );
}

type ContentManagementViewProps = {
  data?: ContentListResponse;
  loading: boolean;
  query?: string;
  queryInput?: InputHTMLAttributes<HTMLInputElement>;
  type?: ContentType | "all";
  status?: ContentStatus | "all";
  rescueRegion?: string;
  publishedFrom?: string;
  publishedTo?: string;
  mapVisibility?: "all" | "on" | "off";
  hasUpdate?: "all" | "yes" | "no";
  draftState?: "all" | NotificationDraftStatus;
  error?: string | null;
  onQueryChange?: (value: string) => void;
  onTypeChange?: (value: ContentType | "all") => void;
  onStatusChange?: (value: ContentStatus | "all") => void;
  onRescueRegionChange?: (value: string) => void;
  onPublishedFromChange?: (value: string) => void;
  onPublishedToChange?: (value: string) => void;
  onMapVisibilityChange?: (value: "all" | "on" | "off") => void;
  onHasUpdateChange?: (value: "all" | "yes" | "no") => void;
  onDraftStateChange?: (value: "all" | NotificationDraftStatus) => void;
  onPageChange?: (page: number) => void;
  fetching?: boolean;
  onRefresh?: () => void;
};

function ContentManagementView({
  data,
  loading,
  query = "",
  queryInput,
  type = "all",
  status = "all",
  rescueRegion = "",
  publishedFrom = "",
  publishedTo = "",
  mapVisibility = "all",
  hasUpdate = "all",
  draftState = "all",
  error,
  onQueryChange,
  onTypeChange,
  onStatusChange,
  onRescueRegionChange,
  onPublishedFromChange,
  onPublishedToChange,
  onMapVisibilityChange,
  onHasUpdateChange,
  onDraftStateChange,
  onPageChange,
  fetching,
  onRefresh,
}: ContentManagementViewProps) {
  const rows = data?.content ?? [];
  const summary = summarizeContentRows(rows);
  // A rejected query leaves `data` (and so `rows`) empty, and summary counts
  // computed from an empty array are real zeros -- not a signal that nothing
  // could be loaded. Show the cards as unavailable, not as "all clear".
  const failed = Boolean(error);
  const columns = useMemo<DataTableColumn<ContentSummary>[]>(
    () => [
      {
        id: "title",
        header: "標題",
        cell: (item) => (
          <div className="min-w-[14rem]">
            <p className="font-semibold text-[var(--color-panel)]">{item.title}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{item.slug}</p>
          </div>
        ),
      },
      {
        id: "type",
        header: "類型",
        cell: (item) => formatContentTypeLabel(item.type, "zh"),
      },
      {
        id: "status",
        header: "狀態",
        cell: (item) => (
          <StatusPill tone={toneMap[contentStatusTone(item.status)]}>
            {statusLabels[item.status]}
          </StatusPill>
        ),
      },
      {
        id: "publishedAt",
        header: "發布日期",
        cell: (item) => (item.publishedAt ? formatDate(item.publishedAt) : "未發布"),
      },
      {
        id: "rescueRegion",
        header: "救援地區",
        cell: (item) => item.storyProfile?.rescueRegion ?? "不適用",
      },
      {
        id: "actions",
        header: "操作",
        cell: (item) => (
          <Link
            to="/admin/content/$id"
            params={{ id: item.id }}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            <Edit3 className="h-3 w-3" />
            編輯
          </Link>
        ),
      },
    ],
    [],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary)]">宣傳</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">宣傳內容</h1>
          <p className="text-sm text-[var(--color-text-muted)]">管理故事、活動、市集與報告頁面。</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/content/new"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)]"
          >
            建立內容
          </Link>
          <Link
            to="/admin/content/adoption"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
          >
            領養資訊
          </Link>
          <Link
            to="/admin/content/adoption-guides"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
          >
            {"\u9818\u990a\u5f8c\u6307\u5357\u7248\u672c"}
          </Link>
          <Link
            to="/admin/content/documents"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
          >
            文件
          </Link>
          <Link
            to="/admin/content/annual-reports"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
          >
            年度報告
          </Link>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
            >
              <RefreshCw className="h-4 w-4" />
              重新整理
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          label="全部內容"
          value={data?.pagination.total ?? summary.total}
          failed={failed}
        />
        <SummaryCard label="本頁已發布" value={summary.published} failed={failed} />
        <SummaryCard label="本頁草稿" value={summary.drafts} failed={failed} />
        <SummaryCard label="本頁救援故事" value={summary.rescueStories} failed={failed} />
      </div>

      <section
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        aria-labelledby="content-eligibility-queue"
      >
        <h2 id="content-eligibility-queue" className="font-semibold text-[var(--color-panel)]">
          本頁內容資格待核對
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">
          只讀清單；未分類內容保持現有公開狀態。正式下架或補上文案前，請逐項取得內容批准。
        </p>
        {failed ? (
          <p role="alert" className="mt-3 text-sm">
            無法載入待核對清單。
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {rows
              .filter(
                (item) =>
                  item.contentClass === "demo" ||
                  (item.status === "published" && item.contentClass !== "verified"),
              )
              .map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-start justify-between gap-2 rounded-md border border-[var(--color-border)] p-3 text-sm"
                >
                  <div className="min-w-0">
                    <p className="font-semibold">
                      {item.title} · {item.contentClass === "demo" ? "示範" : "待核實"}
                    </p>
                    <p className="break-all text-xs text-[var(--color-text-muted)]">
                      ID {item.id} · 公開位置 /stories/{item.slug}
                      {item.storyProfile?.isFeatured ? " · 精選候選" : ""}
                      {item.storyProfile?.showOnMap ? " · 地圖候選" : ""}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      建議：核對資料來源、負責人與生效日期，記錄批准後再更改分類。
                    </p>
                  </div>
                  <Link
                    to="/admin/content/$id"
                    params={{ id: item.id }}
                    className="shrink-0 font-semibold text-[var(--color-primary)] underline"
                  >
                    檢視
                  </Link>
                </li>
              ))}
            {rows.every(
              (item) =>
                item.contentClass !== "demo" &&
                (item.status !== "published" || item.contentClass === "verified"),
            ) ? (
              <li className="text-sm text-[var(--color-text-muted)]">本頁沒有待核對內容。</li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            <span className="inline-flex items-center gap-2">
              <Search className="h-4 w-4" />
              搜尋
            </span>
            <input
              {...(queryInput ?? {
                value: query,
                onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                  onQueryChange?.(event.target.value),
              })}
              placeholder="標題、摘要或 slug"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            <span className="inline-flex items-center gap-2">
              <Filter className="h-4 w-4" />
              類型
            </span>
            <select
              value={type}
              onChange={(event) => onTypeChange?.(event.target.value as ContentType | "all")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-normal"
            >
              {contentTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "全部類型" : formatContentTypeLabel(option, "zh")}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            狀態
            <select
              value={status}
              onChange={(event) => onStatusChange?.(event.target.value as ContentStatus | "all")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-normal"
            >
              {contentStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "全部狀態" : statusLabels[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            救援地區
            <input
              value={rescueRegion}
              onChange={(event) => onRescueRegionChange?.(event.target.value)}
              placeholder="例如：灣仔"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            發布日期（起）
            <input
              type="date"
              value={publishedFrom}
              onChange={(e) => onPublishedFromChange?.(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            發布日期（迄）
            <input
              type="date"
              value={publishedTo}
              onChange={(e) => onPublishedToChange?.(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            地圖顯示
            <select
              value={mapVisibility}
              onChange={(e) => onMapVisibilityChange?.(e.target.value as "all" | "on" | "off")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              <option value="all">全部</option>
              <option value="on">顯示</option>
              <option value="off">不顯示</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            更新記錄
            <select
              value={hasUpdate}
              onChange={(e) => onHasUpdateChange?.(e.target.value as "all" | "yes" | "no")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              <option value="all">全部</option>
              <option value="yes">有更新</option>
              <option value="no">沒有更新</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            通知草稿
            <select
              value={draftState}
              onChange={(e) =>
                onDraftStateChange?.(e.target.value as "all" | NotificationDraftStatus)
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              <option value="all">全部</option>
              <option value="draft">草稿</option>
              <option value="copied">已複製</option>
              <option value="sent_manually">已手動發送</option>
              <option value="dismissed">已略過</option>
            </select>
          </label>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(item) => item.id}
          loading={loading}
          empty="沒有宣傳內容"
          error={error}
          onRetry={onRefresh}
        />
        {!failed && data?.pagination && onPageChange ? (
          <TablePager
            page={data.pagination.page}
            pageSize={data.pagination.pageSize}
            total={data.pagination.total}
            onPageChange={onPageChange}
            busy={fetching}
            label="內容"
          />
        ) : null}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, failed }: { label: string; value: number; failed?: boolean }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-sm font-semibold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-panel)]">
        {failed ? STAT_UNAVAILABLE : value}
      </p>
    </div>
  );
}

function normalizeListResponse(
  response: AdminContentListApiResponse,
  search: string,
): ContentListResponse {
  const params = new URLSearchParams(search);
  const page = Number(params.get("page") ?? "1");
  const pageSize = Number(params.get("pageSize") ?? "25");
  return {
    content: response.items,
    pagination: {
      page,
      pageSize,
      total: response.total,
      pageCount: Math.max(1, Math.ceil(response.total / pageSize)),
    },
  };
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("zh-HK", { dateStyle: "medium" }).format(new Date(value));
}

function CreateContentDraft({
  onCreate,
  busy,
  error,
}: {
  onCreate: (input: { type: ContentType; title: string; summary: string }) => Promise<void>;
  busy: boolean;
  error: string;
}) {
  const [type, setType] = useState<ContentType>("rescue_story");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  return (
    <details className="m-6 rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">新增內容</summary>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate({ type, title, summary });
        }}
      >
        <label className="block">
          內容類型
          <select
            className="ml-2 border p-2"
            value={type}
            onChange={(event) => setType(event.target.value as ContentType)}
          >
            {contentTypeOptions
              .filter((option): option is ContentType => option !== "all")
              .map((option) => (
                <option key={option} value={option}>
                  {formatContentTypeLabel(option, "zh")}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          標題
          <input
            required
            maxLength={180}
            className="block w-full border p-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block">
          摘要
          <textarea
            required
            maxLength={320}
            className="block w-full border p-2"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <p>建立後會開啟草稿編輯器。請補齊相片、來源及類型所需資料，再檢查及發布。</p>
        {error && <p role="alert">{error}</p>}
        <button type="submit" disabled={busy} className="btn-primary min-h-11 px-4">
          {busy ? "建立中…" : "建立草稿"}
        </button>
      </form>
    </details>
  );
}
