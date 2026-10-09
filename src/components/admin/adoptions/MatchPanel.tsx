import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  AnimalMatchSummary,
  CoordinatorStatus,
  MatchableAnimalOption,
} from "../../../lib/adoptions/types";
import { adminErrorMessage } from "../../../lib/admin/session";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { Textarea } from "../../ui/textarea";
import { bilingualStatusName, statusDisplayName, useAdminPageCopy } from "../adminPageCopy";
import { useAdminCopy } from "../i18n/copy";
import { fetchCoordinatorJson } from "./api";
import { filterStatusesByCategory, formatFallback } from "./caseWorkflowLogic";
import { matchPanelCopy } from "./copy";
import { getDefaultMatchStatusId } from "./matchPanelLogic";

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
  animal: MatchableAnimalOption,
  copy: (typeof matchPanelCopy)["zh"],
  animalTypes: ReturnType<typeof useAdminPageCopy>["pageCopy"]["animalTypes"],
) {
  const typeLabel =
    animalTypes[animal.type as keyof typeof animalTypes] ?? animalTypes.unknown ?? animal.type;
  const animalStatusLabels = copy.animalStatuses as Record<string, string>;
  const statusLabel = animalStatusLabels[animal.status] ?? animal.status;

  return copy.animalOption(animal.name, animal.name_en, typeLabel, statusLabel);
}

export function MatchPanel({ caseId, matches, statuses, onChanged }: MatchPanelProps) {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = useAdminCopy(matchPanelCopy);
  const [animalId, setAnimalId] = useState("");
  const [statusId, setStatusId] = useState("");
  const [notes, setNotes] = useState("");

  const matchStatuses = useMemo(() => filterStatusesByCategory(statuses, "match"), [statuses]);

  const {
    data: animals = [],
    error: animalsError,
    isLoading: animalsLoading,
  } = useQuery<MatchableAnimalOption[], Error>({
    queryKey: ["admin-active-animal-options"],
    queryFn: async () =>
      (
        await fetchCoordinatorJson<{ animals: MatchableAnimalOption[] }>(
          "/api/admin/adoptions/animals/match-options",
        )
      ).animals,
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
                  {animalOptionLabel(animal, copy, pageCopy.animalTypes)}
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
          message={
            adminErrorMessage(animalsError, language) ??
            adminErrorMessage(createMutation.error, language) ??
            ""
          }
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
