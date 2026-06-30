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
import { bilingualStatusName, statusDisplayName, useAdminPageCopy } from "../adminPageCopy";
import { fetchCoordinatorJson } from "./api";
import {
  buildFinalizationPayload,
  filterStatusesByCategory,
  findApprovedMatches,
  findDefaultAdoptedOutcomeStatus,
  formatDate,
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

const FINALIZATION_COPY = {
  zh: {
    title: "完成領養",
    subtitle: "需要已批核配對及已領養的最終結果。",
    completeRequired: "請完成必填的完成領養欄位。",
    caseNumber: "個案編號",
    approvalDate: "批核日期",
    pickupDate: "接領日期",
    adoptionFee: "領養費",
    recorded: "已記錄成功領養",
    missingApprovedMatch: "完成前請先建立一個已批核配對狀態的配對。",
    missingAdoptedOutcome: "完成前請建立一個 key 為 adopted 的啟用中最終結果狀態。",
    invalidOutcome: "成功領養完成紀錄需要使用已領養結果狀態。",
    approvedMatch: "已批核配對",
    chooseApprovedMatch: "選擇已批核配對",
    finalOutcome: "最終結果",
    chooseOutcome: "選擇結果",
    adoptionFeeHkd: "領養費 HKD",
    optional: "選填",
    finalize: "完成領養",
    fillRequired: "請填寫必填欄位。費用可輸入元及角分。",
    outcome: "結果",
  },
  en: {
    title: "Finalization",
    subtitle: "Requires an approved match and adopted final outcome.",
    completeRequired: "Complete the required finalization fields.",
    caseNumber: "Case number",
    approvalDate: "Approval date",
    pickupDate: "Pickup date",
    adoptionFee: "Adoption fee",
    recorded: "Successful adoption recorded",
    missingApprovedMatch: "Create a match with an approved match status before finalizing.",
    missingAdoptedOutcome:
      "Create an active final outcome status with key adopted before finalizing.",
    invalidOutcome: "Successful adoption finalization requires the adopted outcome status.",
    approvedMatch: "Approved match",
    chooseApprovedMatch: "Choose approved match",
    finalOutcome: "Final outcome",
    chooseOutcome: "Choose outcome",
    adoptionFeeHkd: "Adoption fee HKD",
    optional: "Optional",
    finalize: "Finalize adoption",
    fillRequired: "Fill the required fields. Fee accepts dollars and cents.",
    outcome: "Outcome",
  },
} as const;

function matchLabel(match: AnimalMatchSummary, language: keyof typeof FINALIZATION_COPY) {
  return `${match.animalName || match.animalId} (${statusDisplayName(match.status, language)})`;
}

export function FinalizationPanel({
  caseId,
  matches,
  statuses,
  successfulAdoption,
  onChanged,
}: FinalizationPanelProps) {
  const { language } = useAdminPageCopy();
  const copy = FINALIZATION_COPY[language];
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
      if (!nextPayload) throw new Error(copy.completeRequired);

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
          <h2 className="text-base font-semibold text-[var(--color-panel)]">{copy.title}</h2>
          <p className="text-xs text-[var(--color-text-muted)]">{copy.subtitle}</p>
        </div>
      </div>

      {successfulAdoption ? (
        <div className="grid gap-3 p-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-text-muted)]">{copy.caseNumber}</div>
            <div className="font-semibold text-[var(--color-panel)]">
              {successfulAdoption.caseNumber}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-text-muted)]">{copy.approvalDate}</div>
            <div className="font-semibold text-[var(--color-panel)]">
              {formatDate(successfulAdoption.approvalDate)}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-text-muted)]">{copy.pickupDate}</div>
            <div className="font-semibold text-[var(--color-panel)]">
              {formatDate(successfulAdoption.pickupDate)}
            </div>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <div className="text-xs text-[var(--color-text-muted)]">{copy.adoptionFee}</div>
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
              {copy.recorded}
            </Badge>
          </div>
        </div>
      ) : (
        <div className="space-y-4 p-4">
          {(missingApprovedMatch || missingAdoptedOutcome || invalidSelectedOutcome) && (
            <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-panel)]">
              {missingApprovedMatch
                ? copy.missingApprovedMatch
                : missingAdoptedOutcome
                  ? copy.missingAdoptedOutcome
                  : copy.invalidOutcome}
            </div>
          )}

          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="final-match">{copy.approvedMatch}</Label>
              <Select
                value={form.matchId}
                onValueChange={(value) => setForm((current) => ({ ...current, matchId: value }))}
                disabled={missingApprovedMatch}
              >
                <SelectTrigger id="final-match" className="h-9">
                  <SelectValue placeholder={copy.chooseApprovedMatch} />
                </SelectTrigger>
                <SelectContent>
                  {approvedMatches.map((match) => (
                    <SelectItem key={match.id} value={match.id}>
                      {matchLabel(match, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="final-outcome">{copy.finalOutcome}</Label>
              <Select
                value={form.outcomeStatusId}
                onValueChange={(value) =>
                  setForm((current) => ({ ...current, outcomeStatusId: value }))
                }
              >
                <SelectTrigger id="final-outcome" className="h-9">
                  <SelectValue placeholder={copy.chooseOutcome} />
                </SelectTrigger>
                <SelectContent>
                  {outcomeStatuses.map((status) => (
                    <SelectItem key={status.id} value={status.id}>
                      {bilingualStatusName(status, language)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="final-case-number">{copy.caseNumber}</Label>
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
              <Label htmlFor="final-approval-date">{copy.approvalDate}</Label>
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
              <Label htmlFor="final-pickup-date">{copy.pickupDate}</Label>
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
              <Label htmlFor="final-adoption-fee">{copy.adoptionFeeHkd}</Label>
              <Input
                id="final-adoption-fee"
                value={form.adoptionFeeHkd}
                onChange={(event) =>
                  setForm((current) => ({ ...current, adoptionFeeHkd: event.target.value }))
                }
                inputMode="decimal"
                className="h-9"
                placeholder={copy.optional}
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
              {copy.finalize}
            </Button>
            {!payload && (
              <span className="text-xs text-[var(--color-text-muted)]">{copy.fillRequired}</span>
            )}
            {selectedOutcome && (
              <span className="text-xs text-[var(--color-text-muted)]">
                {copy.outcome}: {statusDisplayName(selectedOutcome, language)}
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
