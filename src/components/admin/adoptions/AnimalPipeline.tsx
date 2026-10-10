import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, RefreshCcw, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import type {
  AnimalPipelineListResult,
  AnimalPositionRecord,
  ArrivalSourceRecord,
  CoordinatorStatus,
  CoordinatorTask,
} from "../../../lib/adoptions/types";
import { adminErrorMessage } from "../../../lib/admin/session";
import type { Animal, AnimalStatus, AnimalType } from "../../../types/animal";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { useAdminLanguage } from "../adminI18n";
import { DataTable, type DataTableColumn } from "../DataTable";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { confirmActionCopy } from "../confirmActionCopy";
import { LoadFailure } from "../LoadFailure";
import { useAdminCopy } from "../i18n/copy";
import { localizedText } from "../i18n/localizedText";
import { fetchCoordinatorJson } from "./api";
import {
  buildAnimalPipelineExportSearchParams,
  buildAnimalPipelineSearchParams,
  buildAnimalTaskSearchParams,
  groupAnimalPipelineRows,
  hasUnsavedProfileChanges,
  pipelineReadErrorText,
  readPipelineLookup,
  resolveAnimalPipelinePagination,
  type AnimalInternalProfile,
  type AnimalPipelineFilters,
  type AnimalPipelineRow,
} from "./animalPipelineLogic";
import { animalPipelineCopy } from "./animalPipelineCopy";
import { AnimalProfileDialog } from "./AnimalProfileDialog";
import { StatusPill, type StatusTone } from "../StatusBadge";
import { ExportButton } from "./ExportButton";
import { adoptionFormatCopy } from "./formatCopy";

type InternalProfileResponse = {
  profile: AnimalInternalProfile;
};

type AnimalStatusResponse = {
  animal: Animal;
};

type StatusesResponse = {
  statuses: CoordinatorStatus[];
};

type TasksResponse = {
  tasks: CoordinatorTask[];
  total: number;
};

type PositionsResponse = {
  positions: AnimalPositionRecord[];
};

type ArrivalSourcesResponse = {
  arrivalSources: ArrivalSourceRecord[];
};

const PIPELINE_QUERY_KEY = ["coordinator-animal-pipeline"] as const;
const PIPELINE_PAGE_SIZE_OPTIONS = [10, 25, 50] as const;
const PIPELINE_REFERENCE_STALE_TIME_MS = 5 * 60 * 1000;
const PIPELINE_SEARCH_DEBOUNCE_MS = 300;
const POSITIONS_QUERY_KEY = ["animal-positions"] as const;
const ARRIVAL_SOURCES_QUERY_KEY = ["arrival-sources"] as const;
const STATUSES_QUERY_KEY = ["coordinator-statuses"] as const;
const animalTasksQueryKey = (animalId: string | null) => ["coordinator-animal-tasks", animalId];

const EMPTY_POSITIONS: AnimalPositionRecord[] = [];
const EMPTY_ARRIVAL_SOURCES: ArrivalSourceRecord[] = [];
const EMPTY_STATUSES: CoordinatorStatus[] = [];
const EMPTY_TASKS: CoordinatorTask[] = [];
const EMPTY_PIPELINE_ROWS: AnimalPipelineRow[] = [];

const STATUS_FILTERS = ["all", "available", "fostered", "adopted"] as const;
const LIFECYCLE_STATUSES = ["available", "fostered", "adopted"] as const;
const TYPE_FILTERS = ["all", "cat", "dog", "sponsor"] as const;
const ADOPTABLE_FILTERS = ["all", "adoptable", "not_adoptable"] as const;
const SUPPORT_POOL_FILTERS = ["all", "inside", "outside"] as const;

const STATUS_TONES: Record<AnimalStatus, StatusTone> = {
  available: "success",
  fostered: "info",
  adopted: "warning",
};

function cloneProfile(profile: AnimalInternalProfile): AnimalInternalProfile {
  return { ...profile };
}

function formatFallback(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "-";
}

async function readAnimalPipeline(searchParams: URLSearchParams) {
  return fetchCoordinatorJson<AnimalPipelineListResult>(
    `/api/admin/adoptions/animals/pipeline?${searchParams.toString()}`,
  );
}

function readPositions() {
  return readPipelineLookup("positions", async () => {
    const response = await fetchCoordinatorJson<PositionsResponse>(
      "/api/admin/adoptions/positions",
    );
    return response.positions;
  });
}

function readArrivalSources() {
  return readPipelineLookup("arrivalSources", async () => {
    const response = await fetchCoordinatorJson<ArrivalSourcesResponse>(
      "/api/admin/adoptions/arrival-sources",
    );
    return response.arrivalSources;
  });
}

async function readCoordinatorStatuses() {
  const response = await fetchCoordinatorJson<StatusesResponse>("/api/admin/adoptions/statuses");
  return response.statuses;
}

async function readAnimalTasks(animalId: string) {
  const searchParams = buildAnimalTaskSearchParams({ animalId });
  const response = await fetchCoordinatorJson<TasksResponse>(
    `/api/admin/adoptions/tasks?${searchParams.toString()}`,
  );
  return response.tasks;
}

function useDebouncedValue<T>(value: T, delayMs: number) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timeoutId);
  }, [delayMs, value]);

  return debouncedValue;
}

export function AnimalPipeline({ initialAnimalId }: { initialAnimalId?: string }) {
  const { language } = useAdminLanguage();
  const copy = useAdminCopy(animalPipelineCopy);
  const shared = useAdminCopy(confirmActionCopy);
  const format = useAdminCopy(adoptionFormatCopy);
  const queryClient = useQueryClient();
  const appliedInitialAnimalId = useRef<string | null>(null);
  const [query, setQuery] = useState("");
  const [groupBy, setGroupBy] = useState<"status" | "position">("status");
  const [filters, setFilters] = useState<AnimalPipelineFilters>({
    status: "all",
    type: "all",
    adoptable: "all",
    supportPool: "all",
    positionId: "all",
  });
  const [selectedAnimalId, setSelectedAnimalId] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<AnimalInternalProfile | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<(typeof PIPELINE_PAGE_SIZE_OPTIONS)[number]>(25);
  const debouncedQuery = useDebouncedValue(query, PIPELINE_SEARCH_DEBOUNCE_MS);

  const searchParams = useMemo(
    () =>
      buildAnimalPipelineSearchParams({
        q: debouncedQuery,
        ...filters,
        page,
        pageSize,
      }),
    [debouncedQuery, filters, page, pageSize],
  );

  const exportSearchParams = useMemo(
    () =>
      buildAnimalPipelineExportSearchParams({
        q: debouncedQuery,
        ...filters,
      }),
    [debouncedQuery, filters],
  );

  const pipelineQuery = useQuery<AnimalPipelineListResult, Error>({
    queryKey: [...PIPELINE_QUERY_KEY, searchParams.toString()],
    queryFn: () => readAnimalPipeline(searchParams),
    placeholderData: keepPreviousData,
  });

  const initialAnimalParams = useMemo(
    () =>
      initialAnimalId
        ? buildAnimalPipelineSearchParams({ animalId: initialAnimalId, page: 1, pageSize: 1 })
        : null,
    [initialAnimalId],
  );

  const initialAnimalQuery = useQuery<AnimalPipelineListResult, Error>({
    queryKey: [...PIPELINE_QUERY_KEY, "initial", initialAnimalParams?.toString() ?? ""],
    queryFn: () => readAnimalPipeline(initialAnimalParams ?? new URLSearchParams()),
    enabled: Boolean(initialAnimalParams),
    staleTime: PIPELINE_REFERENCE_STALE_TIME_MS,
  });
  const positionsQuery = useQuery<AnimalPositionRecord[], Error>({
    queryKey: POSITIONS_QUERY_KEY,
    queryFn: readPositions,
    staleTime: PIPELINE_REFERENCE_STALE_TIME_MS,
  });
  const sourcesQuery = useQuery<ArrivalSourceRecord[], Error>({
    queryKey: ARRIVAL_SOURCES_QUERY_KEY,
    queryFn: readArrivalSources,
    staleTime: PIPELINE_REFERENCE_STALE_TIME_MS,
  });
  const statusesQuery = useQuery<CoordinatorStatus[], Error>({
    queryKey: STATUSES_QUERY_KEY,
    queryFn: readCoordinatorStatuses,
    staleTime: PIPELINE_REFERENCE_STALE_TIME_MS,
  });
  const selectedAnimalTasksQuery = useQuery<CoordinatorTask[], Error>({
    queryKey: animalTasksQueryKey(selectedAnimalId),
    queryFn: () => readAnimalTasks(selectedAnimalId ?? ""),
    enabled: Boolean(selectedAnimalId),
  });

  const positions = positionsQuery.data ?? EMPTY_POSITIONS;
  const arrivalSources = sourcesQuery.data ?? EMPTY_ARRIVAL_SOURCES;
  const statuses = statusesQuery.data ?? EMPTY_STATUSES;
  const selectedAnimalTasks = selectedAnimalTasksQuery.data ?? EMPTY_TASKS;

  const rows = pipelineQuery.data?.animals ?? EMPTY_PIPELINE_ROWS;
  const total = pipelineQuery.data?.total ?? 0;
  const pipelinePage = pipelineQuery.data?.page;
  const pipelinePageSize = pipelineQuery.data?.pageSize;
  const {
    page: resolvedPage,
    pageSize: resolvedPageSize,
    totalPages,
  } = resolveAnimalPipelinePagination({
    page,
    pageSize,
    responsePage: pipelinePage,
    responsePageSize: pipelinePageSize,
    total,
  });
  const initialAnimalRows = initialAnimalQuery.data?.animals ?? EMPTY_PIPELINE_ROWS;

  const groups = useMemo(() => groupAnimalPipelineRows(rows, groupBy), [groupBy, rows]);

  const selectedRow = useMemo(
    () =>
      rows.find((row) => row.id === selectedAnimalId) ??
      initialAnimalRows.find((row) => row.id === selectedAnimalId) ??
      null,
    [initialAnimalRows, rows, selectedAnimalId],
  );

  const isFetching =
    pipelineQuery.isFetching ||
    positionsQuery.isFetching ||
    sourcesQuery.isFetching ||
    statusesQuery.isFetching;

  const readFailures = [positionsQuery, sourcesQuery, statusesQuery].flatMap((lookup) => {
    const message = pipelineReadErrorText(lookup.error, language);
    return lookup.error && message ? [{ error: lookup.error, message, retry: lookup.refetch }] : [];
  });

  const lifecycleMutation = useMutation<void, Error, { animalId: string; status: AnimalStatus }>({
    mutationFn: ({ animalId, status }) =>
      fetchCoordinatorJson<AnimalStatusResponse>(
        `/api/admin/adoptions/animals/${encodeURIComponent(animalId)}/status`,
        {
          method: "PATCH",
          body: JSON.stringify({ status }),
        },
      ).then(() => undefined),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY });
    },
  });

  const saveProfileMutation = useMutation<InternalProfileResponse, Error, AnimalInternalProfile>({
    mutationFn: (profile) =>
      fetchCoordinatorJson<InternalProfileResponse>(
        `/api/admin/adoptions/animals/${encodeURIComponent(profile.animal_id)}/internal`,
        {
          method: "PUT",
          body: JSON.stringify(profile),
        },
      ),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: PIPELINE_QUERY_KEY });
      closeProfileDialog();
    },
  });

  useEffect(() => {
    if (!initialAnimalId || appliedInitialAnimalId.current === initialAnimalId) {
      return;
    }
    const row =
      rows.find((animal) => animal.id === initialAnimalId) ??
      initialAnimalQuery.data?.animals.find((animal) => animal.id === initialAnimalId);
    if (row) {
      appliedInitialAnimalId.current = initialAnimalId;
      setSelectedAnimalId(row.id);
      setProfileForm(cloneProfile(row.profile));
    }
  }, [initialAnimalId, initialAnimalQuery.data?.animals, rows]);

  useEffect(() => {
    if (
      pipelineQuery.isPlaceholderData ||
      pipelinePage === undefined ||
      pipelinePageSize === undefined
    ) {
      return;
    }

    if (resolvedPage !== page) {
      setPage(resolvedPage);
    }

    if (resolvedPageSize !== pageSize) {
      setPageSize(resolvedPageSize as (typeof PIPELINE_PAGE_SIZE_OPTIONS)[number]);
    }
  }, [
    pipelinePage,
    pipelinePageSize,
    pipelineQuery.isPlaceholderData,
    page,
    pageSize,
    resolvedPage,
    resolvedPageSize,
  ]);

  function refetchAll() {
    pipelineQuery.refetch();
    positionsQuery.refetch();
    sourcesQuery.refetch();
    statusesQuery.refetch();
    if (selectedAnimalId) selectedAnimalTasksQuery.refetch();
  }

  async function invalidateSelectedAnimalTasks() {
    if (!selectedAnimalId) return;
    await queryClient.invalidateQueries({ queryKey: animalTasksQueryKey(selectedAnimalId) });
  }

  function updateFilter<K extends keyof AnimalPipelineFilters>(
    key: K,
    value: AnimalPipelineFilters[K],
  ) {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  }

  function openProfileDialog(row: AnimalPipelineRow) {
    saveProfileMutation.reset();
    setSelectedAnimalId(row.id);
    setProfileForm(cloneProfile(row.profile));
  }

  /**
   * Close path for operator-initiated dismissal. The dialog holds sixteen
   * fields and Radix closes it on any outside click, so an unguarded close
   * discards real typing. onSuccess still calls closeProfileDialog directly —
   * a saved form has nothing to lose.
   */
  function requestCloseProfileDialog() {
    const saved = selectedRow?.profile;
    if (profileForm && saved && hasUnsavedProfileChanges(profileForm, saved)) {
      setDiscardOpen(true);
      return;
    }
    closeProfileDialog();
  }

  function closeProfileDialog() {
    setSelectedAnimalId(null);
    setProfileForm(null);
    saveProfileMutation.reset();
  }

  function updateProfileField<K extends keyof AnimalInternalProfile>(
    key: K,
    value: AnimalInternalProfile[K],
  ) {
    setProfileForm((current) => (current ? { ...current, [key]: value } : current));
  }

  function handleProfileSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!profileForm || saveProfileMutation.isPending) return;
    saveProfileMutation.mutate(profileForm);
  }

  const positionOptions = positions.filter((position) => position.is_active);
  const sourceOptions = arrivalSources.filter((source) => source.is_active);
  const profilePositionOptions =
    profileForm?.current_position_id &&
    !positionOptions.some((position) => position.id === profileForm.current_position_id)
      ? [
          {
            id: profileForm.current_position_id,
            name: copy.unknownPosition,
            type: "unknown",
            for_cat: true,
            for_dog: true,
            address: null,
            contact_person: null,
            phone: null,
            email: null,
            is_active: false,
          },
          ...positionOptions,
        ]
      : positionOptions;
  const profileSourceOptions =
    profileForm?.arrival_source_id &&
    !sourceOptions.some((source) => source.id === profileForm.arrival_source_id)
      ? [
          {
            id: profileForm.arrival_source_id,
            name_zh: copy.unknownSource,
            name_en: null,
            is_active: false,
          },
          ...sourceOptions,
        ]
      : sourceOptions;

  const counts = {
    shown: rows.length,
    total,
    adoptableOnPage: rows.filter((row) => row.profile.is_adoptable).length,
    supportPoolOnPage: rows.filter((row) => row.profile.is_inside_support_pool).length,
  };

  const animalName = (row: AnimalPipelineRow) => localizedText(row.name, row.name_en, language);
  const arrivalSourceName = (row: AnimalPipelineRow) =>
    localizedText(row.arrivalSource?.name_zh, row.arrivalSource?.name_en, language);

  const animalColumns: DataTableColumn<AnimalPipelineRow>[] = [
    {
      id: "animal",
      header: copy.columns.animal,
      className: "w-[28%] px-4",
      cell: (row) => (
        <div className="flex min-w-0 items-center gap-3">
          {row.image_url ? (
            <img
              src={row.image_url}
              alt=""
              className="h-10 w-10 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs font-semibold uppercase text-[var(--color-text-muted)]">
              {row.type.slice(0, 3)}
            </div>
          )}
          <div className="min-w-0">
            <div className="truncate font-semibold text-[var(--color-panel)]">
              {animalName(row)}
            </div>
            <div className="truncate text-xs text-[var(--color-text-muted)]">
              {copy.animalSubline(
                formatFallback(row.name_en),
                copy.animalTypeLabels[row.type],
                row.age,
              )}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "lifecycle",
      header: copy.columns.lifecycle,
      className: "w-44",
      cell: (row) => {
        const isUpdatingStatus =
          lifecycleMutation.isPending && lifecycleMutation.variables?.animalId === row.id;
        return (
          <div className="flex items-center gap-2">
            <StatusPill tone={STATUS_TONES[row.status]}>
              {copy.statusOptions[row.status]}
            </StatusPill>
            <Select
              value={row.status}
              disabled={isUpdatingStatus}
              onValueChange={(value) =>
                lifecycleMutation.mutate({ animalId: row.id, status: value as AnimalStatus })
              }
            >
              <SelectTrigger
                aria-label={copy.updateLifecycle(animalName(row))}
                className="h-8 w-28"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LIFECYCLE_STATUSES.map((value) => (
                  <SelectItem key={value} value={value}>
                    {copy.statusOptions[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        );
      },
    },
    {
      id: "flags",
      header: copy.columns.flags,
      cell: (row) => (
        <div className="flex min-h-8 flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {row.profile.is_adoptable ? copy.flags.adoptable : copy.flags.notAdoptable}
          </Badge>
          {row.profile.is_inside_support_pool && (
            <Badge
              variant="outline"
              className="border-[var(--color-accent-warm)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              {copy.flags.supportPool}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            {copy.flags.chip(row.profile.has_chip)}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            {copy.flags.neutered(row.profile.is_desexed)}
          </Badge>
        </div>
      ),
    },
    {
      id: "position",
      header: copy.columns.position,
      cell: (row) => (
        <div className="text-sm text-[var(--color-panel)]">
          <div>{formatFallback(row.currentPosition?.name)}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {copy.cage(formatFallback(row.profile.cage))}
          </div>
        </div>
      ),
    },
    {
      id: "arrival",
      header: copy.columns.arrival,
      cell: (row) => (
        <div className="text-sm text-[var(--color-panel)]">
          <div>{format.date(row.profile.arrival_date)}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(arrivalSourceName(row))}
            {row.profile.internal_code ? ` / ${row.profile.internal_code}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "profile",
      header: copy.columns.profile,
      className: "w-32 text-right",
      cell: (row) => (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => openProfileDialog(row)}>
            <Edit3 className="h-4 w-4" />
            {copy.edit}
          </Button>
        </div>
      ),
    },
  ];

  function renderAnimalCard(row: AnimalPipelineRow) {
    const isUpdatingStatus =
      lifecycleMutation.isPending && lifecycleMutation.variables?.animalId === row.id;
    return (
      <div className="space-y-3">
        <div className="flex items-start gap-3">
          {row.image_url ? (
            <img
              src={row.image_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-md object-cover"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] text-xs font-semibold uppercase text-[var(--color-text-muted)]">
              {row.type.slice(0, 3)}
            </div>
          )}
          <div className="min-w-0">
            <div className="font-semibold text-[var(--color-panel)]">{animalName(row)}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {copy.animalSubline(
                formatFallback(row.name_en),
                copy.animalTypeLabels[row.type],
                row.age,
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <StatusPill tone={STATUS_TONES[row.status]}>{copy.statusOptions[row.status]}</StatusPill>
          <Select
            value={row.status}
            disabled={isUpdatingStatus}
            onValueChange={(value) =>
              lifecycleMutation.mutate({ animalId: row.id, status: value as AnimalStatus })
            }
          >
            {/* min-h-11 to match the Edit button below it; h-10 left this the
                one sub-44px touch target in the card. */}
            <SelectTrigger
              aria-label={copy.updateLifecycle(animalName(row))}
              className="min-h-11 w-40"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {LIFECYCLE_STATUSES.map((value) => (
                <SelectItem key={value} value={value}>
                  {copy.statusOptions[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {row.profile.is_adoptable ? copy.flags.adoptable : copy.flags.notAdoptable}
          </Badge>
          {row.profile.is_inside_support_pool && (
            <Badge
              variant="outline"
              className="border-[var(--color-accent-warm)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              {copy.flags.supportPool}
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            {copy.flags.chip(row.profile.has_chip)}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            {copy.flags.neutered(row.profile.is_desexed)}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">{copy.columns.position}</div>
            <div className="text-[var(--color-panel)]">
              {formatFallback(row.currentPosition?.name)}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {copy.cage(formatFallback(row.profile.cage))}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">{copy.columns.arrival}</div>
            <div className="text-[var(--color-panel)]">{format.date(row.profile.arrival_date)}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(arrivalSourceName(row))}
              {row.profile.internal_code ? ` / ${row.profile.internal_code}` : ""}
            </div>
          </div>
        </div>

        <Button
          type="button"
          variant="outline"
          onClick={() => openProfileDialog(row)}
          className="min-h-[44px] w-full"
        >
          <Edit3 className="h-4 w-4" />
          {copy.editProfile}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">{copy.title}</h1>
          <p className="text-sm text-[var(--color-text-muted)]">{copy.subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="animals" searchParams={exportSearchParams} />
          <Button type="button" variant="outline" onClick={refetchAll} disabled={isFetching}>
            <RefreshCcw className="h-4 w-4" />
            {copy.refresh}
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 xl:grid-cols-[minmax(220px,1fr)_150px_130px_180px_190px_190px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPage(1);
              }}
              aria-label={copy.searchLabel}
              className="h-9 pl-9"
              placeholder={copy.searchPlaceholder}
            />
          </label>

          <Select
            value={filters.status}
            onValueChange={(value) => updateFilter("status", value as AnimalStatus | "all")}
          >
            <SelectTrigger aria-label={copy.filters.statusLabel} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {copy.statusOptions[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.type}
            onValueChange={(value) => updateFilter("type", value as AnimalType | "all")}
          >
            <SelectTrigger aria-label={copy.filters.typeLabel} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {copy.typeOptions[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.adoptable}
            onValueChange={(value) =>
              updateFilter("adoptable", value as AnimalPipelineFilters["adoptable"])
            }
          >
            <SelectTrigger aria-label={copy.filters.adoptableLabel} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADOPTABLE_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {copy.adoptableOptions[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.supportPool}
            onValueChange={(value) =>
              updateFilter("supportPool", value as AnimalPipelineFilters["supportPool"])
            }
          >
            <SelectTrigger aria-label={copy.filters.supportPoolLabel} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORT_POOL_FILTERS.map((value) => (
                <SelectItem key={value} value={value}>
                  {copy.supportPoolOptions[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.positionId}
            onValueChange={(value) => updateFilter("positionId", value)}
          >
            <SelectTrigger aria-label={copy.filters.positionLabel} className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{copy.filters.allPositions}</SelectItem>
              <SelectItem value="none">{copy.filters.noPosition}</SelectItem>
              {positionOptions.map((position) => (
                <SelectItem key={position.id} value={position.id}>
                  {position.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2">
          <div
            aria-live="polite"
            aria-atomic="true"
            className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]"
          >
            <Badge
              variant="outline"
              className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              {copy.counts.shown(counts.shown)}
            </Badge>
            <span>{copy.counts.matching(counts.total)}</span>
            <span>{copy.counts.adoptable(counts.adoptableOnPage)}</span>
            <span>{copy.counts.supportPool(counts.supportPoolOnPage)}</span>
          </div>
          <Tabs value={groupBy} onValueChange={(value) => setGroupBy(value as typeof groupBy)}>
            <TabsList className="h-8 rounded-lg bg-[var(--color-lavender)] p-1">
              <TabsTrigger
                value="status"
                className="h-6 data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-panel)]"
              >
                {copy.groupBy.status}
              </TabsTrigger>
              <TabsTrigger
                value="position"
                className="h-6 data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-panel)]"
              >
                {copy.groupBy.position}
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {readFailures.map(({ error, message, retry }) => (
          <LoadFailure
            key={message}
            error={error}
            onRetry={() => void retry()}
            title={message}
            className="rounded-none border-0 border-t"
          />
        ))}
        {lifecycleMutation.error && (
          <div
            className="border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-error)]"
            role="alert"
          >
            {adminErrorMessage(lifecycleMutation.error, language) ?? ""}
          </div>
        )}
      </section>

      {pipelineQuery.error ? (
        <LoadFailure
          error={pipelineQuery.error}
          onRetry={() => void pipelineQuery.refetch()}
          title={adminErrorMessage(pipelineQuery.error, language) ?? undefined}
          className="bg-[var(--color-surface)]"
        />
      ) : (
        <div className="space-y-4">
          {pipelineQuery.isLoading &&
            Array.from({ length: 2 }, (_, groupIndex) => (
              <section
                key={groupIndex}
                className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
              >
                <div className="flex min-h-12 items-center gap-3 border-b border-[var(--color-border)] px-4">
                  <div className="h-3 w-28 rounded bg-[var(--color-lavender)]" />
                  <div className="h-3 w-12 rounded bg-[var(--color-lavender)]" />
                </div>
                <div className="space-y-3 p-4">
                  <div className="h-3 w-full rounded bg-[var(--color-lavender)]" />
                  <div className="h-3 w-2/3 rounded bg-[var(--color-lavender)]" />
                </div>
              </section>
            ))}

          {!pipelineQuery.isLoading && groups.length === 0 && (
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-muted)]">
              {copy.empty}
            </section>
          )}

          {groups.map((group) => (
            <section
              key={group.key}
              aria-busy={isFetching}
              className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]"
            >
              <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
                <div>
                  <h2 className="text-base font-semibold text-[var(--color-panel)]">
                    {group.label}
                  </h2>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {copy.animalCount(group.rows.length)}
                  </p>
                </div>
              </div>

              <DataTable<AnimalPipelineRow>
                columns={animalColumns}
                rows={group.rows}
                getRowKey={(row) => row.id}
                renderMobileCard={renderAnimalCard}
              />
            </section>
          ))}

          {!pipelineQuery.isLoading && (
            <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-xs text-[var(--color-text-muted)]">
              <span>{copy.page(resolvedPage, totalPages)}</span>
              <div className="flex items-center gap-2">
                <Select
                  value={String(resolvedPageSize)}
                  onValueChange={(value) => {
                    setPageSize(Number(value) as (typeof PIPELINE_PAGE_SIZE_OPTIONS)[number]);
                    setPage(1);
                  }}
                >
                  <SelectTrigger aria-label={copy.rowsPerPage} className="h-8 w-20">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PIPELINE_PAGE_SIZE_OPTIONS.map((option) => (
                      <SelectItem key={option} value={String(option)}>
                        {option}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((currentPage) => Math.max(1, currentPage - 1))}
                  disabled={resolvedPage <= 1 || isFetching}
                >
                  {copy.previous}
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => setPage((currentPage) => Math.min(totalPages, currentPage + 1))}
                  disabled={resolvedPage >= totalPages || isFetching}
                >
                  {copy.next}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      <ConfirmActionDialog
        open={discardOpen}
        onOpenChange={setDiscardOpen}
        title={shared.discardChanges}
        consequence={copy.discardConfirm}
        confirmLabel={shared.discardChanges}
        destructive
        reason="none"
        onConfirm={async () => closeProfileDialog()}
      />
      <AnimalProfileDialog
        open={Boolean(selectedAnimalId)}
        animalName={selectedRow ? animalName(selectedRow) : null}
        profileForm={profileForm}
        sourceOptions={profileSourceOptions}
        positionOptions={profilePositionOptions}
        saving={saveProfileMutation.isPending}
        saveError={adminErrorMessage(saveProfileMutation.error, language)}
        onFieldChange={updateProfileField}
        onSubmit={handleProfileSubmit}
        onRequestClose={requestCloseProfileDialog}
        animalId={selectedAnimalId}
        tasks={selectedAnimalTasks}
        statuses={statuses}
        // admin-load-failure-ok: the dialog wraps this message in a LoadFailure with a retry
        tasksError={adminErrorMessage(selectedAnimalTasksQuery.error, language)}
        tasksCause={selectedAnimalTasksQuery.error}
        onRetryTasks={() => void selectedAnimalTasksQuery.refetch()}
        onTasksChanged={invalidateSelectedAnimalTasks}
      />
    </div>
  );
}
