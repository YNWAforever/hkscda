import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type { AnimalMatchSummary, CoordinatorStatus } from "../../../lib/adoptions/types";
import { supabase } from "../../../lib/supabase";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Textarea } from "../../ui/textarea";
import {
  bilingualStatusName,
  formatAdminNumber,
  statusDisplayName,
  useAdminPageCopy,
} from "../adminPageCopy";
import { fetchCoordinatorJson } from "./api";
import { filterStatusesByCategory, formatFallback } from "./caseWorkflowLogic";
import { getDefaultMatchStatusId, getMatchableAnimalStatuses } from "./matchPanelLogic";

type AnimalOption = {
  id: string;
  name: string;
  name_en: string | null;
  type: string;
  status: string;
};

type MatchPanelProps = {
  caseId: string;
  matches: AnimalMatchSummary[];
  statuses: CoordinatorStatus[];
  onChanged?: () => Promise<void> | void;
};

type CreateMatchResponse = {
  match: {
    id: string;
  };
};

const STATUS_DOT_CLASSES: Record<string, string> = {
  amber: "bg-[var(--color-warning)]",
  blue: "bg-[var(--color-panel)]",
  coral: "bg-[var(--color-primary)]",
  cyan: "bg-[var(--color-lavender-deep)]",
  green: "bg-[var(--color-success)]",
  indigo: "bg-[var(--color-panel-2)]",
  purple: "bg-[var(--color-secondary)]",
  red: "bg-[var(--color-error)]",
  slate: "bg-[var(--color-text-muted)]",
};

const MATCH_PANEL_COPY = {
  zh: {
    title: "配對",
    recorded: (count: number) => `${formatAdminNumber(count, "zh")} 筆紀錄`,
    animal: "動物",
    loadingAnimals: "載入動物中...",
    chooseAnimal: "選擇動物",
    matchStatus: "配對狀態",
    chooseStatus: "選擇狀態",
    notes: "備註",
    optionalNote: "選填協調員備註",
    addMatch: "新增配對",
    status: "狀態",
    approved: "已批核",
    no: "否",
    noMatches: "尚未有配對",
    animalStatuses: {
      available: "可領養",
      fostered: "暫託中",
    },
  },
  en: {
    title: "Matches",
    recorded: (count: number) => `${formatAdminNumber(count, "en")} recorded`,
    animal: "Animal",
    loadingAnimals: "Loading animals...",
    chooseAnimal: "Choose animal",
    matchStatus: "Match status",
    chooseStatus: "Choose status",
    notes: "Notes",
    optionalNote: "Optional coordinator note",
    addMatch: "Add match",
    status: "Status",
    approved: "Approved",
    no: "No",
    noMatches: "No matches yet",
    animalStatuses: {
      available: "Available",
      fostered: "Fostered",
    },
  },
} as const;

export function MatchPanelAsyncError({ message }: { message: string }) {
  return (
    <div
      className="border-b border-[var(--color-border)] px-4 py-2 text-sm text-[var(--color-error)]"
      role="alert"
    >
      {message}
    </div>
  );
}

function StatusChip({ status }: { status: CoordinatorStatus }) {
  const { language } = useAdminPageCopy();

  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
    >
      <span
        className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[status.color] ?? "bg-[var(--color-border)]"}`}
        aria-hidden="true"
      />
      {statusDisplayName(status, language)}
    </Badge>
  );
}

function animalOptionLabel(
  animal: AnimalOption,
  language: keyof typeof MATCH_PANEL_COPY,
  animalTypes: ReturnType<typeof useAdminPageCopy>["pageCopy"]["animalTypes"],
) {
  const englishName = animal.name_en ? ` / ${animal.name_en}` : "";
  const typeLabel =
    animalTypes[animal.type as keyof typeof animalTypes] ?? animalTypes.unknown ?? animal.type;
  const animalStatusLabels = MATCH_PANEL_COPY[language].animalStatuses as Record<string, string>;
  const statusLabel = animalStatusLabels[animal.status] ?? animal.status;

  return `${animal.name}${englishName} (${typeLabel} · ${statusLabel})`;
}

export function MatchPanel({ caseId, matches, statuses, onChanged }: MatchPanelProps) {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = MATCH_PANEL_COPY[language];
  const [animalId, setAnimalId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [notes, setNotes] = useState("");

  const matchStatuses = useMemo(() => filterStatusesByCategory(statuses, "match"), [statuses]);

  const {
    data: animals = [],
    error: animalsError,
    isLoading: animalsLoading,
  } = useQuery<AnimalOption[], Error>({
    queryKey: ["admin-active-animal-options"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("animals")
        .select("id,name,name_en,type,status")
        .in("status", getMatchableAnimalStatuses())
        .order("type")
        .order("name", { ascending: true });
      if (error) throw error;
      return (data ?? []) as AnimalOption[];
    },
  });

  useEffect(() => {
    if (statusId || matchStatuses.length === 0) return;
    const defaultStatusId = getDefaultMatchStatusId(matchStatuses);
    if (defaultStatusId) setStatusId(defaultStatusId);
  }, [matchStatuses, statusId]);

  const createMutation = useMutation<CreateMatchResponse, Error, void>({
    mutationFn: () =>
      fetchCoordinatorJson<CreateMatchResponse>(
        `/api/admin/adoptions/cases/${encodeURIComponent(caseId)}/matches`,
        {
          method: "POST",
          body: JSON.stringify({
            animalId,
            statusId,
            notes: notes.trim() || undefined,
          }),
        },
      ),
    onSuccess: async () => {
      setAnimalId("");
      setNotes("");
      await onChanged?.();
    },
  });

  const canCreate = Boolean(animalId && statusId) && !createMutation.isPending;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-panel)]">{copy.title}</h2>
          <p className="text-xs text-[var(--color-text-muted)]">{copy.recorded(matches.length)}</p>
        </div>
      </div>

      <div className="grid gap-4 border-b border-[var(--color-border)] p-4 lg:grid-cols-[minmax(220px,1fr)_220px_minmax(240px,1fr)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="match-animal">{copy.animal}</Label>
          <Select value={animalId} onValueChange={setAnimalId} disabled={animalsLoading}>
            <SelectTrigger id="match-animal" className="h-9">
              <SelectValue placeholder={animalsLoading ? copy.loadingAnimals : copy.chooseAnimal} />
            </SelectTrigger>
            <SelectContent>
              {animals.map((animal) => (
                <SelectItem key={animal.id} value={animal.id}>
                  {animalOptionLabel(animal, language, pageCopy.animalTypes)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="match-status">{copy.matchStatus}</Label>
          <Select value={statusId} onValueChange={setStatusId}>
            <SelectTrigger id="match-status" className="h-9">
              <SelectValue placeholder={copy.chooseStatus} />
            </SelectTrigger>
            <SelectContent>
              {matchStatuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {bilingualStatusName(status, language)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="match-notes">{copy.notes}</Label>
          <Textarea
            id="match-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-9"
            placeholder={copy.optionalNote}
          />
        </div>

        <div className="flex items-end">
          <Button type="button" onClick={() => createMutation.mutate()} disabled={!canCreate}>
            <Plus className="h-4 w-4" />
            {copy.addMatch}
          </Button>
        </div>
      </div>

      {(animalsError || createMutation.error) && (
        <MatchPanelAsyncError
          message={animalsError?.message ?? createMutation.error?.message ?? ""}
        />
      )}

      <Table>
        <TableHeader>
          <TableRow className="h-11 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]">
            <TableHead className="px-4 text-[var(--color-text-muted)]">{copy.animal}</TableHead>
            <TableHead className="text-[var(--color-text-muted)]">{copy.status}</TableHead>
            <TableHead className="text-[var(--color-text-muted)]">{copy.approved}</TableHead>
            <TableHead className="text-[var(--color-text-muted)]">{copy.notes}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matches.length === 0 && (
            <TableRow className="h-16">
              <TableCell colSpan={4} className="px-4 text-[var(--color-text-muted)]">
                {copy.noMatches}
              </TableCell>
            </TableRow>
          )}
          {matches.map((match) => (
            <TableRow key={match.id} className="h-16">
              <TableCell className="px-4 font-medium text-[var(--color-panel)]">
                {formatFallback(match.animalName)}
              </TableCell>
              <TableCell>
                <StatusChip status={match.status} />
              </TableCell>
              <TableCell>
                <Badge
                  variant="outline"
                  className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
                >
                  {match.isApproved ? copy.approved : copy.no}
                </Badge>
              </TableCell>
              <TableCell className="max-w-md text-[var(--color-text-muted)]">
                {formatFallback(match.notes)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
