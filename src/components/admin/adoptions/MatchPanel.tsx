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
import { fetchCoordinatorJson } from "./api";
import { filterStatusesByCategory, formatFallback } from "./caseWorkflowLogic";
import {
  formatAnimalOptionLabel,
  getDefaultMatchStatusId,
  getMatchableAnimalStatuses,
} from "./matchPanelLogic";

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
  return (
    <Badge
      variant="outline"
      className="gap-1.5 border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
    >
      <span
        className={`h-2 w-2 rounded-full ${STATUS_DOT_CLASSES[status.color] ?? "bg-[var(--color-border)]"}`}
        aria-hidden="true"
      />
      {status.labelZh}
      <span className="font-normal text-[var(--color-text-muted)]">{status.labelEn}</span>
    </Badge>
  );
}

export function MatchPanel({ caseId, matches, statuses, onChanged }: MatchPanelProps) {
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
          <h2 className="text-base font-semibold text-[var(--color-panel)]">Matches</h2>
          <p className="text-xs text-[var(--color-text-muted)]">{matches.length} recorded</p>
        </div>
      </div>

      <div className="grid gap-4 border-b border-[var(--color-border)] p-4 lg:grid-cols-[minmax(220px,1fr)_220px_minmax(240px,1fr)_auto]">
        <div className="space-y-1.5">
          <Label htmlFor="match-animal">Animal</Label>
          <Select value={animalId} onValueChange={setAnimalId} disabled={animalsLoading}>
            <SelectTrigger id="match-animal" className="h-9">
              <SelectValue placeholder={animalsLoading ? "Loading animals..." : "Choose animal"} />
            </SelectTrigger>
            <SelectContent>
              {animals.map((animal) => (
                <SelectItem key={animal.id} value={animal.id}>
                  {formatAnimalOptionLabel(animal)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="match-status">Match status</Label>
          <Select value={statusId} onValueChange={setStatusId}>
            <SelectTrigger id="match-status" className="h-9">
              <SelectValue placeholder="Choose status" />
            </SelectTrigger>
            <SelectContent>
              {matchStatuses.map((status) => (
                <SelectItem key={status.id} value={status.id}>
                  {status.labelZh} / {status.labelEn}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="match-notes">Notes</Label>
          <Textarea
            id="match-notes"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-9"
            placeholder="Optional coordinator note"
          />
        </div>

        <div className="flex items-end">
          <Button type="button" onClick={() => createMutation.mutate()} disabled={!canCreate}>
            <Plus className="h-4 w-4" />
            Add match
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
            <TableHead className="px-4 text-[var(--color-text-muted)]">Animal</TableHead>
            <TableHead className="text-[var(--color-text-muted)]">Status</TableHead>
            <TableHead className="text-[var(--color-text-muted)]">Approved</TableHead>
            <TableHead className="text-[var(--color-text-muted)]">Notes</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {matches.length === 0 && (
            <TableRow className="h-16">
              <TableCell colSpan={4} className="px-4 text-[var(--color-text-muted)]">
                No matches yet
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
                  {match.isApproved ? "Approved" : "No"}
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
