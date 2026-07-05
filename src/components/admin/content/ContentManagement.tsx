import { useMemo, useState } from "react";
import { Edit3, Filter, RefreshCw, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import type { ContentStatus, ContentSummary, ContentType } from "../../../lib/content/types";
import { fetchAdminJson } from "../../../lib/admin/http";
import { DataTable, type DataTableColumn } from "../DataTable";
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

export function ContentManagement({ initialData }: ContentManagementProps) {
  if (initialData) {
    return <ContentManagementView data={initialData} loading={false} />;
  }

  return <ContentManagementRuntime />;
}

function ContentManagementRuntime() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [type, setType] = useState<ContentType | "all">("all");
  const [status, setStatus] = useState<ContentStatus | "all">("all");
  const [rescueRegion, setRescueRegion] = useState("");

  const search = useMemo(
    () =>
      buildContentSearchParams({
        q: query,
        type,
        status,
        rescueRegion,
        page: 1,
      }).toString(),
    [query, rescueRegion, status, type],
  );

  const contentQuery = useQuery({
    queryKey: ["admin-content", search],
    queryFn: async () => {
      const response = await fetchAdminJson<AdminContentListApiResponse>(
        `/api/admin/content?${search}`,
      );
      return normalizeListResponse(response, search);
    },
  });

  return (
    <ContentManagementView
      data={contentQuery.data}
      loading={contentQuery.isLoading}
      query={query}
      type={type}
      status={status}
      rescueRegion={rescueRegion}
      error={contentQuery.error instanceof Error ? contentQuery.error.message : null}
      onQueryChange={setQuery}
      onTypeChange={setType}
      onStatusChange={setStatus}
      onRescueRegionChange={setRescueRegion}
      onRefresh={() => void queryClient.invalidateQueries({ queryKey: ["admin-content"] })}
    />
  );
}

type ContentManagementViewProps = {
  data?: ContentListResponse;
  loading: boolean;
  query?: string;
  type?: ContentType | "all";
  status?: ContentStatus | "all";
  rescueRegion?: string;
  error?: string | null;
  onQueryChange?: (value: string) => void;
  onTypeChange?: (value: ContentType | "all") => void;
  onStatusChange?: (value: ContentStatus | "all") => void;
  onRescueRegionChange?: (value: string) => void;
  onRefresh?: () => void;
};

function ContentManagementView({
  data,
  loading,
  query = "",
  type = "all",
  status = "all",
  rescueRegion = "",
  error,
  onQueryChange,
  onTypeChange,
  onStatusChange,
  onRescueRegionChange,
  onRefresh,
}: ContentManagementViewProps) {
  const rows = data?.content ?? [];
  const summary = summarizeContentRows(rows);
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
          <a
            href={`/admin/content/${item.id}`}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            <Edit3 className="h-3 w-3" />
            編輯
          </a>
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

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard label="全部內容" value={data?.pagination.total ?? summary.total} />
        <SummaryCard label="本頁已發布" value={summary.published} />
        <SummaryCard label="本頁草稿" value={summary.drafts} />
        <SummaryCard label="本頁救援故事" value={summary.rescueStories} />
      </div>

      <section className="space-y-3">
        <div className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            <span className="inline-flex items-center gap-2">
              <Search className="h-4 w-4" />
              搜尋
            </span>
            <input
              value={query}
              onChange={(event) => onQueryChange?.(event.target.value)}
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

        {error ? (
          <p className="rounded-lg border border-[var(--color-error)] bg-[var(--color-surface)] p-3 text-sm font-semibold text-[var(--color-error)]">
            {error}
          </p>
        ) : null}

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(item) => item.id}
          loading={loading}
          empty="沒有宣傳內容"
        />
      </section>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-sm font-semibold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{value}</p>
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
