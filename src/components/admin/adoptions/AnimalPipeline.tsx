import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Edit3, RefreshCcw, Save, Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import type { CoordinatorStatus, CoordinatorTask } from "../../../lib/adoptions/types";
import { supabase } from "../../../lib/supabase";
import type { Animal, AnimalStatus, AnimalType } from "../../../types/animal";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { Tabs, TabsList, TabsTrigger } from "../../ui/tabs";
import { Textarea } from "../../ui/textarea";
import { DataTable, type DataTableColumn } from "../DataTable";
import { fetchCoordinatorJson } from "./api";
import {
  buildAnimalTaskSearchParams,
  filterAnimalPipelineRows,
  groupAnimalPipelineRows,
  type AnimalInternalProfile,
  type AnimalPipelineFilters,
  type AnimalPipelineRow,
  type AnimalPositionSummary,
  type ArrivalSourceSummary,
} from "./animalPipelineLogic";
import { ExportButton } from "./ExportButton";
import { TaskPanel, TaskPanelAsyncError } from "./TaskPanel";

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

type AnimalPosition = AnimalPositionSummary & {
  for_cat: boolean;
  for_dog: boolean;
  address: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  is_active: boolean;
};

type ArrivalSource = ArrivalSourceSummary & {
  is_active: boolean;
};

const ANIMALS_QUERY_KEY = ["coordinator-animals"] as const;
const INTERNAL_PROFILES_QUERY_KEY = ["animal-internal-profiles"] as const;
const POSITIONS_QUERY_KEY = ["animal-positions"] as const;
const ARRIVAL_SOURCES_QUERY_KEY = ["arrival-sources"] as const;
const STATUSES_QUERY_KEY = ["coordinator-statuses"] as const;
const animalTasksQueryKey = (animalId: string | null) => ["coordinator-animal-tasks", animalId];

const EMPTY_ANIMALS: Animal[] = [];
const EMPTY_INTERNAL_PROFILES: AnimalInternalProfile[] = [];
const EMPTY_POSITIONS: AnimalPosition[] = [];
const EMPTY_ARRIVAL_SOURCES: ArrivalSource[] = [];
const EMPTY_STATUSES: CoordinatorStatus[] = [];
const EMPTY_TASKS: CoordinatorTask[] = [];

const STATUS_OPTIONS: Array<{ value: AnimalStatus | "all"; label: string }> = [
  { value: "all", label: "All statuses" },
  { value: "available", label: "Available" },
  { value: "fostered", label: "Fostered" },
  { value: "adopted", label: "Adopted" },
];

const STATUS_ACTIONS: Array<{ value: AnimalStatus; label: string }> = [
  { value: "available", label: "Available" },
  { value: "fostered", label: "Fostered" },
  { value: "adopted", label: "Adopted" },
];

const TYPE_OPTIONS: Array<{ value: AnimalType | "all"; label: string }> = [
  { value: "all", label: "All types" },
  { value: "cat", label: "Cats" },
  { value: "dog", label: "Dogs" },
  { value: "sponsor", label: "Sponsor" },
];

const ADOPTABLE_OPTIONS: Array<{ value: AnimalPipelineFilters["adoptable"]; label: string }> = [
  { value: "all", label: "Any adoptable flag" },
  { value: "adoptable", label: "Adoptable" },
  { value: "not_adoptable", label: "Not adoptable" },
];

const SUPPORT_POOL_OPTIONS: Array<{
  value: AnimalPipelineFilters["supportPool"];
  label: string;
}> = [
  { value: "all", label: "Any support pool flag" },
  { value: "inside", label: "Inside support pool" },
  { value: "outside", label: "Outside support pool" },
];

const BOOLEAN_SELECT_OPTIONS = [
  { value: "unknown", label: "Unknown" },
  { value: "yes", label: "Yes" },
  { value: "no", label: "No" },
] as const;

const STATUS_BADGE_CLASSES: Record<AnimalStatus, string> = {
  available: "border-[var(--color-success)] bg-[var(--color-surface-2)] text-[var(--color-panel)]",
  fostered:
    "border-[var(--color-lavender-deep)] bg-[var(--color-surface-2)] text-[var(--color-panel)]",
  adopted:
    "border-[var(--color-accent-warm)] bg-[var(--color-surface-2)] text-[var(--color-panel)]",
};

function createDefaultProfile(animalId: string): AnimalInternalProfile {
  return {
    animal_id: animalId,
    internal_code: null,
    arrival_date: null,
    arrival_source_id: null,
    current_position_id: null,
    cage: null,
    has_chip: null,
    chip_remarks: null,
    is_desexed: null,
    desexed_at: null,
    desex_remarks: null,
    is_adoptable: true,
    is_inside_support_pool: false,
    adopted_at: null,
    deceased_at: null,
    internal_remarks: null,
  };
}

function cloneProfile(profile: AnimalInternalProfile): AnimalInternalProfile {
  return { ...profile };
}

function nullableBooleanToSelect(value: boolean | null) {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function selectToNullableBoolean(value: string) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function formatFallback(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "-";
}

function formatDate(value: string | null | undefined) {
  const trimmed = value?.trim();
  return trimmed ? trimmed.slice(0, 10) : "-";
}

function lowerSearchValue(row: AnimalPipelineRow) {
  return [
    row.name,
    row.name_en,
    row.type,
    row.status,
    row.profile.internal_code,
    row.profile.cage,
    row.currentPosition?.name,
    row.arrivalSource?.name_zh,
    row.arrivalSource?.name_en,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

async function readAnimals() {
  const { data, error } = await supabase
    .from("animals")
    .select("*")
    .order("updated_at", { ascending: false });
  if (error) throw new Error(`Animals could not load: ${error.message}`);
  return (data ?? []) as Animal[];
}

async function readInternalProfiles() {
  const { data, error } = await supabase.from("animal_profile_internal").select("*");
  if (error) throw new Error(`Internal profiles could not load: ${error.message}`);
  return (data ?? []) as AnimalInternalProfile[];
}

async function readPositions() {
  const { data, error } = await supabase
    .from("animal_position")
    .select("id,name,type,for_cat,for_dog,address,contact_person,phone,email,is_active")
    .order("is_active", { ascending: false })
    .order("name", { ascending: true });
  if (error) throw new Error(`Positions could not load: ${error.message}`);
  return (data ?? []) as AnimalPosition[];
}

async function readArrivalSources() {
  const { data, error } = await supabase
    .from("arrival_source")
    .select("id,name_zh,name_en,is_active")
    .order("is_active", { ascending: false })
    .order("name_zh", { ascending: true });
  if (error) throw new Error(`Arrival sources could not load: ${error.message}`);
  return (data ?? []) as ArrivalSource[];
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

function statusLabel(status: AnimalStatus) {
  return STATUS_ACTIONS.find((option) => option.value === status)?.label ?? status;
}

function ProfileFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-[var(--color-error)]">
      {message}
    </p>
  );
}

export function AnimalPipeline({ initialAnimalId }: { initialAnimalId?: string }) {
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

  const animalsQuery = useQuery<Animal[], Error>({
    queryKey: ANIMALS_QUERY_KEY,
    queryFn: readAnimals,
  });
  const profilesQuery = useQuery<AnimalInternalProfile[], Error>({
    queryKey: INTERNAL_PROFILES_QUERY_KEY,
    queryFn: readInternalProfiles,
  });
  const positionsQuery = useQuery<AnimalPosition[], Error>({
    queryKey: POSITIONS_QUERY_KEY,
    queryFn: readPositions,
  });
  const sourcesQuery = useQuery<ArrivalSource[], Error>({
    queryKey: ARRIVAL_SOURCES_QUERY_KEY,
    queryFn: readArrivalSources,
  });
  const statusesQuery = useQuery<CoordinatorStatus[], Error>({
    queryKey: STATUSES_QUERY_KEY,
    queryFn: readCoordinatorStatuses,
  });
  const selectedAnimalTasksQuery = useQuery<CoordinatorTask[], Error>({
    queryKey: animalTasksQueryKey(selectedAnimalId),
    queryFn: () => readAnimalTasks(selectedAnimalId ?? ""),
    enabled: Boolean(selectedAnimalId),
  });

  const animals = animalsQuery.data ?? EMPTY_ANIMALS;
  const profiles = profilesQuery.data ?? EMPTY_INTERNAL_PROFILES;
  const positions = positionsQuery.data ?? EMPTY_POSITIONS;
  const arrivalSources = sourcesQuery.data ?? EMPTY_ARRIVAL_SOURCES;
  const statuses = statusesQuery.data ?? EMPTY_STATUSES;
  const selectedAnimalTasks = selectedAnimalTasksQuery.data ?? EMPTY_TASKS;

  const rows = useMemo<AnimalPipelineRow[]>(() => {
    const profilesByAnimalId = new Map(profiles.map((profile) => [profile.animal_id, profile]));
    const positionsById = new Map(positions.map((position) => [position.id, position]));
    const sourcesById = new Map(arrivalSources.map((source) => [source.id, source]));

    return animals.map((animal) => {
      const profile = profilesByAnimalId.get(animal.id) ?? createDefaultProfile(animal.id);
      const currentPosition = profile.current_position_id
        ? (positionsById.get(profile.current_position_id) ?? {
            id: profile.current_position_id,
            name: "Unknown position",
            type: "unknown",
          })
        : null;
      const arrivalSource = profile.arrival_source_id
        ? (sourcesById.get(profile.arrival_source_id) ?? {
            id: profile.arrival_source_id,
            name_zh: "Unknown source",
            name_en: null,
          })
        : null;

      return {
        ...animal,
        profile,
        currentPosition,
        arrivalSource,
      };
    });
  }, [animals, arrivalSources, positions, profiles]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = filterAnimalPipelineRows(rows, filters);
    if (!normalizedQuery) return filtered;
    return filtered.filter((row) => lowerSearchValue(row).includes(normalizedQuery));
  }, [filters, query, rows]);

  const groups = useMemo(
    () => groupAnimalPipelineRows(visibleRows, groupBy),
    [groupBy, visibleRows],
  );

  const selectedRow = useMemo(
    () => rows.find((row) => row.id === selectedAnimalId) ?? null,
    [rows, selectedAnimalId],
  );

  const isFetching =
    animalsQuery.isFetching ||
    profilesQuery.isFetching ||
    positionsQuery.isFetching ||
    sourcesQuery.isFetching ||
    statusesQuery.isFetching;

  const readErrors = [
    profilesQuery.error?.message,
    positionsQuery.error?.message,
    sourcesQuery.error?.message,
    statusesQuery.error?.message,
  ].filter(Boolean);

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
      await queryClient.invalidateQueries({ queryKey: ANIMALS_QUERY_KEY });
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
      await queryClient.invalidateQueries({ queryKey: INTERNAL_PROFILES_QUERY_KEY });
      closeProfileDialog();
    },
  });

  useEffect(() => {
    if (
      !initialAnimalId ||
      appliedInitialAnimalId.current === initialAnimalId ||
      rows.length === 0
    ) {
      return;
    }
    const row = rows.find((animal) => animal.id === initialAnimalId);
    if (row) {
      appliedInitialAnimalId.current = initialAnimalId;
      setSelectedAnimalId(row.id);
      setProfileForm(cloneProfile(row.profile));
    }
  }, [initialAnimalId, rows]);

  function refetchAll() {
    animalsQuery.refetch();
    profilesQuery.refetch();
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
  }

  function openProfileDialog(row: AnimalPipelineRow) {
    saveProfileMutation.reset();
    setSelectedAnimalId(row.id);
    setProfileForm(cloneProfile(row.profile));
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
            name: "Unknown position",
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
            name_zh: "Unknown source",
            name_en: null,
            is_active: false,
          },
          ...sourceOptions,
        ]
      : sourceOptions;

  const counts = {
    total: rows.length,
    visible: visibleRows.length,
    adoptable: rows.filter((row) => row.profile.is_adoptable).length,
    supportPool: rows.filter((row) => row.profile.is_inside_support_pool).length,
  };

  const animalColumns: DataTableColumn<AnimalPipelineRow>[] = [
    {
      id: "animal",
      header: "Animal",
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
            <div className="truncate font-semibold text-[var(--color-panel)]">{row.name}</div>
            <div className="truncate text-xs text-[var(--color-text-muted)]">
              {formatFallback(row.name_en)} / {row.type} / {row.age}
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "lifecycle",
      header: "Lifecycle",
      className: "w-44",
      cell: (row) => {
        const isUpdatingStatus =
          lifecycleMutation.isPending && lifecycleMutation.variables?.animalId === row.id;
        return (
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>
              {statusLabel(row.status)}
            </Badge>
            <Select
              value={row.status}
              disabled={isUpdatingStatus}
              onValueChange={(value) =>
                lifecycleMutation.mutate({ animalId: row.id, status: value as AnimalStatus })
              }
            >
              <SelectTrigger aria-label={`Update ${row.name} lifecycle`} className="h-8 w-28">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_ACTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
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
      header: "Flags",
      cell: (row) => (
        <div className="flex min-h-8 flex-wrap items-center gap-1.5">
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
          >
            {row.profile.is_adoptable ? "Adoptable" : "Not adoptable"}
          </Badge>
          {row.profile.is_inside_support_pool && (
            <Badge
              variant="outline"
              className="border-[var(--color-accent-warm)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              Support pool
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            Chip {row.profile.has_chip === null ? "-" : row.profile.has_chip ? "Y" : "N"}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            Desex {row.profile.is_desexed === null ? "-" : row.profile.is_desexed ? "Y" : "N"}
          </Badge>
        </div>
      ),
    },
    {
      id: "position",
      header: "Position",
      cell: (row) => (
        <div className="text-sm text-[var(--color-panel)]">
          <div>{formatFallback(row.currentPosition?.name)}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            Cage {formatFallback(row.profile.cage)}
          </div>
        </div>
      ),
    },
    {
      id: "arrival",
      header: "Arrival",
      cell: (row) => (
        <div className="text-sm text-[var(--color-panel)]">
          <div>{formatDate(row.profile.arrival_date)}</div>
          <div className="text-xs text-[var(--color-text-muted)]">
            {formatFallback(row.arrivalSource?.name_zh)}
            {row.profile.internal_code ? ` / ${row.profile.internal_code}` : ""}
          </div>
        </div>
      ),
    },
    {
      id: "profile",
      header: "Profile",
      className: "w-32 text-right",
      cell: (row) => (
        <div className="flex justify-end">
          <Button type="button" size="sm" variant="outline" onClick={() => openProfileDialog(row)}>
            <Edit3 className="h-4 w-4" />
            Edit
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
            <div className="font-semibold text-[var(--color-panel)]">{row.name}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(row.name_en)} / {row.type} / {row.age}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className={STATUS_BADGE_CLASSES[row.status]}>
            {statusLabel(row.status)}
          </Badge>
          <Select
            value={row.status}
            disabled={isUpdatingStatus}
            onValueChange={(value) =>
              lifecycleMutation.mutate({ animalId: row.id, status: value as AnimalStatus })
            }
          >
            <SelectTrigger aria-label={`Update ${row.name} lifecycle`} className="h-10 w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_ACTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
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
            {row.profile.is_adoptable ? "Adoptable" : "Not adoptable"}
          </Badge>
          {row.profile.is_inside_support_pool && (
            <Badge
              variant="outline"
              className="border-[var(--color-accent-warm)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              Support pool
            </Badge>
          )}
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            Chip {row.profile.has_chip === null ? "-" : row.profile.has_chip ? "Y" : "N"}
          </Badge>
          <Badge
            variant="outline"
            className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
          >
            Desex {row.profile.is_desexed === null ? "-" : row.profile.is_desexed ? "Y" : "N"}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">Position</div>
            <div className="text-[var(--color-panel)]">
              {formatFallback(row.currentPosition?.name)}
            </div>
            <div className="text-xs text-[var(--color-text-muted)]">
              Cage {formatFallback(row.profile.cage)}
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--color-text-muted)]">Arrival</div>
            <div className="text-[var(--color-panel)]">{formatDate(row.profile.arrival_date)}</div>
            <div className="text-xs text-[var(--color-text-muted)]">
              {formatFallback(row.arrivalSource?.name_zh)}
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
          Edit profile
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Animal pipeline</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Internal lifecycle, placement, support pool, and medical readiness.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <ExportButton kind="animals" />
          <Button type="button" variant="outline" onClick={refetchAll} disabled={isFetching}>
            <RefreshCcw className="h-4 w-4" />
            Refresh
          </Button>
        </div>
      </div>

      <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
        <div className="grid gap-3 p-4 xl:grid-cols-[minmax(220px,1fr)_150px_130px_180px_190px_190px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search animal pipeline"
              className="h-9 pl-9"
              placeholder="Search name, code, cage, position"
            />
          </label>

          <Select
            value={filters.status}
            onValueChange={(value) => updateFilter("status", value as AnimalStatus | "all")}
          >
            <SelectTrigger aria-label="Filter by lifecycle status" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.type}
            onValueChange={(value) => updateFilter("type", value as AnimalType | "all")}
          >
            <SelectTrigger aria-label="Filter by animal type" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
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
            <SelectTrigger aria-label="Filter by adoptable flag" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ADOPTABLE_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
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
            <SelectTrigger aria-label="Filter by support pool flag" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SUPPORT_POOL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filters.positionId}
            onValueChange={(value) => updateFilter("positionId", value)}
          >
            <SelectTrigger aria-label="Filter by current position" className="h-9">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All positions</SelectItem>
              <SelectItem value="none">No position</SelectItem>
              {positionOptions.map((position) => (
                <SelectItem key={position.id} value={position.id}>
                  {position.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex min-h-12 flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border)] px-4 py-2">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--color-text-muted)]">
            <Badge
              variant="outline"
              className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              {counts.visible} visible
            </Badge>
            <span>{counts.total} total</span>
            <span>{counts.adoptable} adoptable</span>
            <span>{counts.supportPool} in support pool</span>
          </div>
          <Tabs value={groupBy} onValueChange={(value) => setGroupBy(value as typeof groupBy)}>
            <TabsList className="h-8 rounded-lg bg-[var(--color-lavender)] p-1">
              <TabsTrigger
                value="status"
                className="h-6 data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-panel)]"
              >
                Status
              </TabsTrigger>
              <TabsTrigger
                value="position"
                className="h-6 data-[state=active]:bg-[var(--color-surface)] data-[state=active]:text-[var(--color-panel)]"
              >
                Position
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {readErrors.length > 0 && (
          <div
            className="space-y-1 border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-error)]"
            role="alert"
          >
            {readErrors.map((message) => (
              <p key={message}>{message}</p>
            ))}
          </div>
        )}
        {lifecycleMutation.error && (
          <div
            className="border-t border-[var(--color-border)] px-4 py-3 text-sm text-[var(--color-error)]"
            role="alert"
          >
            {lifecycleMutation.error.message}
          </div>
        )}
      </section>

      {animalsQuery.error ? (
        <section
          className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 text-sm text-[var(--color-error)]"
          role="alert"
        >
          {animalsQuery.error.message}
        </section>
      ) : (
        <div className="space-y-4">
          {animalsQuery.isLoading &&
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

          {!animalsQuery.isLoading && groups.length === 0 && (
            <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 text-sm text-[var(--color-text-muted)]">
              No animals match these filters.
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
                    {group.rows.length} animals
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
        </div>
      )}

      <Dialog
        open={Boolean(selectedAnimalId)}
        onOpenChange={(open) => !open && closeProfileDialog()}
      >
        <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto border-[var(--color-border)] bg-[var(--color-surface)]">
          <DialogHeader>
            <DialogTitle className="text-[var(--color-panel)]">
              Internal profile{selectedRow ? `: ${selectedRow.name}` : ""}
            </DialogTitle>
            <DialogDescription className="text-[var(--color-text-muted)]">
              Placement, intake, medical, and coordinator-only notes.
            </DialogDescription>
          </DialogHeader>

          {profileForm && (
            <>
              <form className="space-y-5" onSubmit={handleProfileSubmit}>
                <section className="grid gap-4 md:grid-cols-3">
                  <div className="grid gap-2">
                    <Label htmlFor="internal-code">Internal code</Label>
                    <Input
                      id="internal-code"
                      value={profileForm.internal_code ?? ""}
                      onChange={(event) => updateProfileField("internal_code", event.target.value)}
                      placeholder="CAT-001"
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="arrival-date">Arrival date</Label>
                    <Input
                      id="arrival-date"
                      type="date"
                      value={profileForm.arrival_date ?? ""}
                      onChange={(event) => updateProfileField("arrival_date", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="arrival-source">Arrival source</Label>
                    <Select
                      value={profileForm.arrival_source_id ?? "none"}
                      disabled={profileSourceOptions.length === 0}
                      onValueChange={(value) =>
                        updateProfileField("arrival_source_id", value === "none" ? null : value)
                      }
                    >
                      <SelectTrigger id="arrival-source" aria-label="Arrival source">
                        <SelectValue
                          placeholder={
                            profileSourceOptions.length === 0
                              ? "No sources configured"
                              : "Arrival source"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No source</SelectItem>
                        {profileSourceOptions.map((source) => (
                          <SelectItem key={source.id} value={source.id}>
                            {source.name_zh}
                            {source.name_en ? ` / ${source.name_en}` : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {profileSourceOptions.length === 0 && (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        No arrival sources are configured.
                      </p>
                    )}
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
                  <div className="grid gap-2">
                    <Label htmlFor="current-position">Current position</Label>
                    <Select
                      value={profileForm.current_position_id ?? "none"}
                      disabled={profilePositionOptions.length === 0}
                      onValueChange={(value) =>
                        updateProfileField("current_position_id", value === "none" ? null : value)
                      }
                    >
                      <SelectTrigger id="current-position" aria-label="Current position">
                        <SelectValue
                          placeholder={
                            profilePositionOptions.length === 0
                              ? "No positions configured"
                              : "Current position"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No position</SelectItem>
                        {profilePositionOptions.map((position) => (
                          <SelectItem key={position.id} value={position.id}>
                            {position.name} ({position.type})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {profilePositionOptions.length === 0 && (
                      <p className="text-xs text-[var(--color-text-muted)]">
                        No animal positions are configured.
                      </p>
                    )}
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="cage">Cage</Label>
                    <Input
                      id="cage"
                      value={profileForm.cage ?? ""}
                      onChange={(event) => updateProfileField("cage", event.target.value)}
                      placeholder="A-12"
                    />
                  </div>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
                    <div className="grid gap-2">
                      <Label htmlFor="has-chip">Microchip</Label>
                      <Select
                        value={nullableBooleanToSelect(profileForm.has_chip)}
                        onValueChange={(value) =>
                          updateProfileField("has_chip", selectToNullableBoolean(value))
                        }
                      >
                        <SelectTrigger id="has-chip" aria-label="Microchip status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BOOLEAN_SELECT_OPTIONS.map((option) => (
                            <SelectItem key={option.value} value={option.value}>
                              {option.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="chip-remarks">Chip remarks</Label>
                      <Textarea
                        id="chip-remarks"
                        value={profileForm.chip_remarks ?? ""}
                        onChange={(event) => updateProfileField("chip_remarks", event.target.value)}
                        rows={3}
                      />
                    </div>
                  </div>

                  <div className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <div className="grid gap-2">
                        <Label htmlFor="is-desexed">Desexed</Label>
                        <Select
                          value={nullableBooleanToSelect(profileForm.is_desexed)}
                          onValueChange={(value) =>
                            updateProfileField("is_desexed", selectToNullableBoolean(value))
                          }
                        >
                          <SelectTrigger id="is-desexed" aria-label="Desexed status">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {BOOLEAN_SELECT_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid gap-2">
                        <Label htmlFor="desexed-at">Desexed date</Label>
                        <Input
                          id="desexed-at"
                          type="date"
                          value={profileForm.desexed_at ?? ""}
                          onChange={(event) => updateProfileField("desexed_at", event.target.value)}
                        />
                      </div>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="desex-remarks">Desex remarks</Label>
                      <Textarea
                        id="desex-remarks"
                        value={profileForm.desex_remarks ?? ""}
                        onChange={(event) =>
                          updateProfileField("desex_remarks", event.target.value)
                        }
                        rows={3}
                      />
                    </div>
                  </div>
                </section>

                <section className="grid gap-3 md:grid-cols-2">
                  <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--color-border)] px-3">
                    <span>
                      <span className="block text-sm font-medium text-[var(--color-panel)]">
                        Adoptable
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        Controls internal readiness filters.
                      </span>
                    </span>
                    <Switch
                      checked={profileForm.is_adoptable}
                      onCheckedChange={(checked) => updateProfileField("is_adoptable", checked)}
                      aria-label="Adoptable"
                    />
                  </label>
                  <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--color-border)] px-3">
                    <span>
                      <span className="block text-sm font-medium text-[var(--color-panel)]">
                        Support pool
                      </span>
                      <span className="text-xs text-[var(--color-text-muted)]">
                        Marks animals needing internal support.
                      </span>
                    </span>
                    <Switch
                      checked={profileForm.is_inside_support_pool}
                      onCheckedChange={(checked) =>
                        updateProfileField("is_inside_support_pool", checked)
                      }
                      aria-label="Inside support pool"
                    />
                  </label>
                </section>

                <section className="grid gap-4 md:grid-cols-2">
                  <div className="grid gap-2">
                    <Label htmlFor="adopted-at">Adopted date</Label>
                    <Input
                      id="adopted-at"
                      type="date"
                      value={profileForm.adopted_at ?? ""}
                      onChange={(event) => updateProfileField("adopted_at", event.target.value)}
                    />
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="deceased-at">Deceased date</Label>
                    <Input
                      id="deceased-at"
                      type="date"
                      value={profileForm.deceased_at ?? ""}
                      onChange={(event) => updateProfileField("deceased_at", event.target.value)}
                    />
                  </div>
                </section>

                <section className="grid gap-2">
                  <Label htmlFor="internal-remarks">Internal remarks</Label>
                  <Textarea
                    id="internal-remarks"
                    value={profileForm.internal_remarks ?? ""}
                    onChange={(event) => updateProfileField("internal_remarks", event.target.value)}
                    rows={4}
                  />
                </section>

                {saveProfileMutation.error && (
                  <ProfileFieldError message={saveProfileMutation.error.message} />
                )}

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={closeProfileDialog}
                    disabled={saveProfileMutation.isPending}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saveProfileMutation.isPending}>
                    <Save className="h-4 w-4" />
                    {saveProfileMutation.isPending ? "Saving" : "Save profile"}
                  </Button>
                </DialogFooter>
              </form>

              <TaskPanel
                title="Animal tasks"
                subtitle="Open coordinator work for this animal"
                tasks={selectedAnimalTasks}
                statuses={statuses}
                defaultLinks={{ animalId: selectedAnimalId ?? undefined }}
                onChanged={invalidateSelectedAnimalTasks}
              />
              {selectedAnimalTasksQuery.error && (
                <TaskPanelAsyncError message={selectedAnimalTasksQuery.error.message} />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
