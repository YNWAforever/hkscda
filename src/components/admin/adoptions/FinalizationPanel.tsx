import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import type {
  AnimalMatchSummary,
  CoordinatorStatus,
  SuccessfulAdoption,
} from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { fetchCoordinatorJson } from "./api";
import {
  buildFinalizationPayload,
  filterStatusesByCategory,
  findApprovedMatches,
  findDefaultAdoptedOutcomeStatus,
  formatDate,
  formatFallback,
  formatHkdCents,
} from "./caseWorkflowLogic";
import type { FinalizationFormState } from "./caseWorkflowLogic";

type FinalizationPanelProps = {
  caseId: string;
  matches: AnimalMatchSummary[];
  statuses: CoordinatorStatus[];
  successfulAdoption: SuccessfulAdoption | null;
  onChanged?: () => Promise<void> | void;
};

type FinalizeResponse = {
  adoption: {
    id: string;
  };
};

function todayInputValue() {
  const now = new Date();
  const localNow = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return localNow.toISOString().slice(0, 10);
}

function emptyForm(): FinalizationFormState {
  return {
    matchId: "",
    outcomeStatusId: "",
    caseNumber: "",
    adoptionFeeHkd: "",
    approvalDate: todayInputValue(),
    pickupDate: "",
  };
}

function matchLabel(match: AnimalMatchSummary) {
  return `${match.animalName || match.animalId} (${match.status.labelEn})`;
}

export function FinalizationPanel({
  caseId,
  matches,
  statuses,
  successfulAdoption,
  onChanged,
}: FinalizationPanelProps) {
  const [form, setForm] = useState<FinalizationFormState>(() => emptyForm());

  const approvedMatches = useMemo(() => findApprovedMatches(matches), [matches]);
  const outcomeStatuses = useMemo(
    () => filterStatusesByCategory(statuses, "final_outcome"),
    [statuses],
  );
  const defaultOutcome = useMemo(() => findDefaultAdoptedOutcomeStatus(statuses), [statuses]);
  const selectedOutcome = outcomeStatuses.find((status) => status.id === form.outcomeStatusId);
  const selectedOutcomeIsAdopted = selectedOutcome?.key === "adopted";
  const payload = useMemo(() => buildFinalizationPayload(form), [form]);

  useEffect(() => {
    setForm((currentForm) => {
      const currentMatchIsApproved = approvedMatches.some(
        (match) => match.id === currentForm.matchId,
      );
      const nextMatchId = currentMatchIsApproved
        ? currentForm.matchId
        : (approvedMatches[0]?.id ?? "");
      const nextOutcomeStatusId = currentForm.outcomeStatusId || defaultOutcome?.id || "";

      if (
        nextMatchId === currentForm.matchId &&
        nextOutcomeStatusId === currentForm.outcomeStatusId
      ) {
        return currentForm;
      }

      return {
        ...currentForm,
        matchId: nextMatchId,
        outcomeStatusId: nextOutcomeStatusId,
      };
    });
  }, [approvedMatches, defaultOutcome]);

  const finalizeMutation = useMutation<FinalizeResponse, Error, void>({
    mutationFn: () => {
      const nextPayload = buildFinalizationPayload(form);
      if (!nextPayload) throw new Error("Complete the required finalization fields.");

      return fetchCoordinatorJson<FinalizeResponse>(
        `/api/admin/adoptions/cases/${encodeURIComponent(caseId)}/finalize`,
        {
          method: "POST",
          body: JSON.stringify(nextPayload),
        },
      );
    },
    onSuccess: async () => {
      await onChanged?.();
    },
  });

  const missingApprovedMatch = approvedMatches.length === 0;
  const missingAdoptedOutcome = !defaultOutcome;
  const invalidSelectedOutcome = Boolean(selectedOutcome && !selectedOutcomeIsAdopted);
  const canFinalize =
    Boolean(payload) &&
    !successfulAdoption &&
    !missingApprovedMatch &&
    !missingAdoptedOutcome &&
    !invalidSelectedOutcome &&
    !finalizeMutation.isPending;

  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-panel)]">Finalization</h2>
          <p className="text-xs text-[var(--color-text-muted)]">
            Requires an approved match and adopted final outcome.
          </p>
        </div>
      </div>

      {successfulAdoption ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-text-muted)]">Case number</div>
            <div className="font-semibold text-[var(--color-panel)]">
              {successfulAdoption.caseNumber}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-text-muted)]">Approval date</div>
            <div className="font-semibold text-[var(--color-panel)]">
              {formatDate(successfulAdoption.approvalDate)}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-text-muted)]">Pickup date</div>
            <div className="font-semibold text-[var(--color-panel)]">
              {formatDate(successfulAdoption.pickupDate)}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-text-muted)]">Adoption fee</div>
            <div className="font-semibold text-[var(--color-panel)]">
              {formatHkdCents(successfulAdoption.adoptionFeeCents)}
            </div>
          </div>
          <div className="md:col-span-2 xl:col-span-4">
            <Badge
              variant="outline"
              className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
            >
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
              Successful adoption recorded
            </Badge>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {(missingApprovedMatch || missingAdoptedOutcome || invalidSelectedOutcome) && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-panel)]">
              {missingApprovedMatch
                ? "Create a match with an approved match status before finalizing."
                : missingAdoptedOutcome
                  ? "Create an active final outcome status with key adopted before finalizing."
                  : "Successful adoption finalization requires the adopted outcome status."}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="final-match">Approved match</Label>
              <Select
                value={form.matchId}
                onValueChange={(value) => setForm((current) => ({ ...current, matchId: value }))}
                disabled={missingApprovedMatch}
              >
                <SelectTrigger id="final-match" className="h-9">
                  <SelectValue placeholder="Choose approved match" />
                </SelectTrigger>
                <SelectContent>
                  {approvedMatches.map((match) => (
                    <SelectItem key={match.id} value={match.id}>
                      {matchLabel(match)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="final-outcome">Final outcome</Label>
              <Select
                value={form.outcomeStatusId}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, outcomeStatusId: value }))
                }
              >
                <SelectTrigger id="final-outcome" className="h-9">
                  <SelectValue placeholder="Choose outcome" />
                </SelectTrigger>
                <SelectContent>
                  {outcomeStatuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {status.labelZh} / {status.labelEn}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="final-case-number">Case number</Label>
              <Input
                id="final-case-number"
                value={form.caseNumber}
                onChange={(event) =>
                  setForm((current) => ({ ...current, caseNumber: event.target.value }))
                }
                className="h-9"
                placeholder="HK-2026-001"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="final-approval-date">Approval date</Label>
              <Input
                id="final-approval-date"
                type="date"
                value={form.approvalDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, approvalDate: event.target.value }))
                }
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="final-pickup-date">Pickup date</Label>
              <Input
                id="final-pickup-date"
                type="date"
                value={form.pickupDate}
                onChange={(event) =>
                  setForm((current) => ({ ...current, pickupDate: event.target.value }))
                }
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="final-adoption-fee">Adoption fee HKD</Label>
              <Input
                id="final-adoption-fee"
                value={form.adoptionFeeHkd}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adoptionFeeHkd: event.target.value }))
                }
                inputMode="decimal"
                className="h-9"
                placeholder="Optional"
              />
            </div>
          </div>

          {finalizeMutation.error && (
            <p role="alert" className="text-sm text-[var(--color-error)]">
              {finalizeMutation.error.message}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="button" onClick={() => finalizeMutation.mutate()} disabled={!canFinalize}>
              <CheckCircle2 className="h-4 w-4" />
              Finalize adoption
            </Button>
            {!payload && (
              <span className="text-xs text-[var(--color-text-muted)]">
                Fill the required fields. Fee accepts dollars and cents.
              </span>
            )}
            {selectedOutcome && (
              <span className="text-xs text-[var(--color-text-muted)]">
                Outcome: {formatFallback(selectedOutcome.labelEn)}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
