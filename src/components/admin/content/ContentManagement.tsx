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
import { adminErrorMessage } from "../../../lib/admin/session";
import {
  parseListPage,
  useListQueryState,
  type ListRouteState,
} from "../../../lib/admin/useListQueryState";
import { useAdminLanguage } from "../adminI18n";
import { DataTable, type DataTableColumn } from "../DataTable";
import { useAdminCopy } from "../i18n/copy";
import { STAT_UNAVAILABLE } from "../LoadFailure";
import { TablePager } from "../TablePager";
import { StatusPill, type StatusTone } from "../StatusBadge";
import {
  buildContentSearchParams,
  contentStatusTone,
  formatContentTypeLabel,
  summarizeContentRows,
} from "./contentAdminLogic";
import { contentCommonCopy } from "./contentCommonCopy";
import { managementCopy } from "./managementCopy";

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
    // A fixed list handed in as a prop has nothing to load, so it can never fail or refresh.
    return <ContentManagementView data={initialData} loading={false} onRefresh={() => {}} />;
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
  const { language } = useAdminLanguage();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [createFailed, setCreateFailed] = useState(false);
  const [creating, setCreating] = useState(false);
  async function createDraft(input: { type: ContentType; title: string; summary: string }) {
    setCreating(true);
    setCreateFailed(false);
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
      setCreateFailed(true);
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
      <CreateContentDraft onCreate={createDraft} busy={creating} failed={createFailed} />
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
        // admin-load-failure-ok: the view passes this to its DataTable, which shows a LoadFailure with onRefresh as the retry
        error={adminErrorMessage(contentQuery.error, language)}
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
  onRefresh: () => void;
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
  const copy = useAdminCopy(managementCopy);
  const common = useAdminCopy(contentCommonCopy);
  const { language } = useAdminLanguage();
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
        header: copy.table.title,
        cell: (item) => (
          <div className="min-w-[14rem]">
            <p className="font-semibold text-[var(--color-panel)]">{item.title}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{item.slug}</p>
          </div>
        ),
      },
      {
        id: "type",
        header: copy.table.type,
        cell: (item) => formatContentTypeLabel(item.type, language),
      },
      {
        id: "status",
        header: copy.table.status,
        cell: (item) => (
          <StatusPill tone={toneMap[contentStatusTone(item.status)]}>
            {common.statuses[item.status]}
          </StatusPill>
        ),
      },
      {
        id: "publishedAt",
        header: copy.table.publishedAt,
        cell: (item) =>
          item.publishedAt ? common.date(item.publishedAt) : copy.table.notPublished,
      },
      {
        id: "rescueRegion",
        header: copy.table.rescueRegion,
        cell: (item) => item.storyProfile?.rescueRegion ?? copy.table.notApplicable,
      },
      {
        id: "actions",
        header: copy.table.actions,
        cell: (item) => (
          <Link
            to="/admin/content/$id"
            params={{ id: item.id }}
            className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-2 py-1 text-xs font-semibold text-[var(--color-primary)] hover:underline"
          >
            <Edit3 className="h-3 w-3" />
            {copy.table.edit}
          </Link>
        ),
      },
    ],
    [copy, common, language],
  );

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--color-primary)]">{copy.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/admin/content/new"
            className="rounded-md bg-[var(--color-primary)] px-3 py-2 text-sm font-bold text-[var(--color-primary-foreground)]"
          >
            {copy.actions.create}
          </Link>
          <Link
            to="/admin/content/adoption"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
          >
            {copy.actions.adoptionInformation}
          </Link>
          <Link
            to="/admin/content/adoption-guides"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
          >
            {copy.actions.guideReleases}
          </Link>
          <Link
            to="/admin/content/documents"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
          >
            {copy.actions.documents}
          </Link>
          <Link
            to="/admin/content/annual-reports"
            className="rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
          >
            {copy.actions.annualReports}
          </Link>
          {onRefresh ? (
            <button
              type="button"
              onClick={onRefresh}
              className="inline-flex items-center gap-2 rounded-md border border-[var(--color-border)] px-3 py-2 text-sm font-semibold text-[var(--color-panel)]"
            >
              <RefreshCw className="h-4 w-4" />
              {copy.actions.refresh}
            </button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <SummaryCard
          label={copy.cards.all}
          value={data?.pagination.total ?? summary.total}
          failed={failed}
        />
        <SummaryCard label={copy.cards.published} value={summary.published} failed={failed} />
        <SummaryCard label={copy.cards.drafts} value={summary.drafts} failed={failed} />
        <SummaryCard
          label={copy.cards.rescueStories}
          value={summary.rescueStories}
          failed={failed}
        />
      </div>

      <section
        className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4"
        aria-labelledby="content-eligibility-queue"
      >
        <h2 id="content-eligibility-queue" className="font-semibold text-[var(--color-panel)]">
          {copy.eligibility.heading}
        </h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{copy.eligibility.intro}</p>
        {failed ? (
          <p role="alert" className="mt-3 text-sm">
            {copy.eligibility.failed}
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
                      {item.title} ·{" "}
                      {item.contentClass === "demo"
                        ? copy.eligibility.demo
                        : copy.eligibility.unverified}
                    </p>
                    <p className="break-all text-xs text-[var(--color-text-muted)]">
                      {copy.eligibility.detail(
                        item.id,
                        item.slug,
                        Boolean(item.storyProfile?.isFeatured),
                        Boolean(item.storyProfile?.showOnMap),
                      )}
                    </p>
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {copy.eligibility.suggestion}
                    </p>
                  </div>
                  <Link
                    to="/admin/content/$id"
                    params={{ id: item.id }}
                    className="shrink-0 font-semibold text-[var(--color-primary)] underline"
                  >
                    {copy.eligibility.view}
                  </Link>
                </li>
              ))}
            {rows.every(
              (item) =>
                item.contentClass !== "demo" &&
                (item.status !== "published" || item.contentClass === "verified"),
            ) ? (
              <li className="text-sm text-[var(--color-text-muted)]">{copy.eligibility.none}</li>
            ) : null}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="grid gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            <span className="inline-flex items-center gap-2">
              <Search className="h-4 w-4" />
              {copy.filters.search}
            </span>
            <input
              {...(queryInput ?? {
                value: query,
                onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
                  onQueryChange?.(event.target.value),
              })}
              placeholder={copy.filters.searchPlaceholder}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            <span className="inline-flex items-center gap-2">
              <Filter className="h-4 w-4" />
              {copy.filters.type}
            </span>
            <select
              value={type}
              onChange={(event) => onTypeChange?.(event.target.value as ContentType | "all")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-normal"
            >
              {contentTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all"
                    ? copy.filters.allTypes
                    : formatContentTypeLabel(option, language)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            {copy.filters.status}
            <select
              value={status}
              onChange={(event) => onStatusChange?.(event.target.value as ContentStatus | "all")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-normal"
            >
              {contentStatusOptions.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? copy.filters.allStatuses : common.statuses[option]}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            {copy.filters.rescueRegion}
            <input
              value={rescueRegion}
              onChange={(event) => onRescueRegionChange?.(event.target.value)}
              placeholder={copy.filters.rescueRegionPlaceholder}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 text-sm font-normal"
            />
          </label>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            {copy.filters.publishedFrom}
            <input
              type="date"
              value={publishedFrom}
              onChange={(e) => onPublishedFromChange?.(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            {copy.filters.publishedTo}
            <input
              type="date"
              value={publishedTo}
              onChange={(e) => onPublishedToChange?.(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            />
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            {copy.filters.mapVisibility}
            <select
              value={mapVisibility}
              onChange={(e) => onMapVisibilityChange?.(e.target.value as "all" | "on" | "off")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              <option value="all">{copy.filters.all}</option>
              <option value="on">{copy.filters.mapOn}</option>
              <option value="off">{copy.filters.mapOff}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            {copy.filters.updates}
            <select
              value={hasUpdate}
              onChange={(e) => onHasUpdateChange?.(e.target.value as "all" | "yes" | "no")}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              <option value="all">{copy.filters.all}</option>
              <option value="yes">{copy.filters.withUpdates}</option>
              <option value="no">{copy.filters.withoutUpdates}</option>
            </select>
          </label>
          <label className="space-y-1 text-sm font-semibold text-[var(--color-panel)]">
            {copy.filters.drafts}
            <select
              value={draftState}
              onChange={(e) =>
                onDraftStateChange?.(e.target.value as "all" | NotificationDraftStatus)
              }
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-background)] px-3 py-2 font-normal"
            >
              <option value="all">{copy.filters.all}</option>
              <option value="draft">{copy.filters.draftStates.draft}</option>
              <option value="copied">{copy.filters.draftStates.copied}</option>
              <option value="sent_manually">{copy.filters.draftStates.sent_manually}</option>
              <option value="dismissed">{copy.filters.draftStates.dismissed}</option>
            </select>
          </label>
        </div>

        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(item) => item.id}
          loading={loading}
          empty={copy.table.empty}
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
            label={copy.table.pager}
          />
        ) : null}
      </section>
    </div>
  );
}

function SummaryCard({ label, value, failed }: { label: string; value: number; failed?: boolean }) {
  const copy = useAdminCopy(managementCopy).cards;
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <p className="text-sm font-semibold text-[var(--color-text-muted)]">{label}</p>
      <p className="mt-1 text-2xl font-bold text-[var(--color-panel)]">
        {failed ? STAT_UNAVAILABLE : copy.count(value)}
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

/** The quick "add content" form above the list. `failed` is set when the last attempt failed. */
export function CreateContentDraft({
  onCreate,
  busy,
  failed,
}: {
  onCreate: (input: { type: ContentType; title: string; summary: string }) => Promise<void>;
  busy: boolean;
  failed: boolean;
}) {
  const copy = useAdminCopy(managementCopy).draftForm;
  const { language } = useAdminLanguage();
  const [type, setType] = useState<ContentType>("rescue_story");
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  return (
    <details className="m-6 rounded-lg border p-4">
      <summary className="cursor-pointer font-semibold">{copy.summary}</summary>
      <form
        className="mt-4 space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          void onCreate({ type, title, summary });
        }}
      >
        <label className="block">
          {copy.type}
          <select
            className="ml-2 border p-2"
            value={type}
            onChange={(event) => setType(event.target.value as ContentType)}
          >
            {contentTypeOptions
              .filter((option): option is ContentType => option !== "all")
              .map((option) => (
                <option key={option} value={option}>
                  {formatContentTypeLabel(option, language)}
                </option>
              ))}
          </select>
        </label>
        <label className="block">
          {copy.title}
          <input
            required
            maxLength={180}
            className="block w-full border p-2"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
        </label>
        <label className="block">
          {copy.summaryLabel}
          <textarea
            required
            maxLength={320}
            className="block w-full border p-2"
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>
        <p>{copy.note}</p>
        {failed && <p role="alert">{copy.failed}</p>}
        <button type="submit" disabled={busy} className="btn-primary min-h-11 px-4">
          {busy ? copy.busy : copy.submit}
        </button>
      </form>
    </details>
  );
}
