import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import type {
  AdoptionCaseDetail,
  CoordinatorStatus,
  CoordinatorStatusCategory,
} from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { fetchCoordinatorJson } from "./api";
import {
  filterStatusesByCategory,
  findApprovedMatches,
  formatDate,
  formatFallback,
  formatHkdCents,
} from "./caseWorkflowLogic";
import { FinalizationPanel } from "./FinalizationPanel";
import { MatchPanel } from "./MatchPanel";
import { TaskPanel } from "./TaskPanel";

type CaseDetailProps = {
  caseId: string;
};

type CaseDetailResponse = {
  case: AdoptionCaseDetail;
};

type StatusesResponse = {
  statuses: CoordinatorStatus[];
};

type StatusUpdateResponse = {
  ok: true;
};

const STATUSES_QUERY_KEY = ["coordinator-statuses"] as const;

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

function sectionClassName() {
  return "rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]";
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
      <span>{status.labelZh}</span>
      <span className="font-normal text-[var(--color-text-muted)]">{status.labelEn}</span>
    </Badge>
  );
}

function Section({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className={sectionClassName()}>
      <div className="flex min-h-14 items-center justify-between gap-3 border-b border-[var(--color-border)] px-4">
        <div>
          <h2 className="text-base font-semibold text-[var(--color-panel)]">{title}</h2>
          {subtitle && <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function CaseDetailStatusesError({ message }: { message: string }) {
  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-error)]"
      role="alert"
    >
      Could not load statuses: {message}
    </div>
  );
}

function DetailGrid({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <div className="grid md:grid-cols-2 xl:grid-cols-3">
      {items.map((item) => (
        <div
          key={item.label}
          className="min-h-16 border-b border-[var(--color-border)] px-4 py-3 md:border-r xl:[&:nth-child(3n)]:border-r-0"
        >
          <div className="text-xs text-[var(--color-text-muted)]">{item.label}</div>
          <div className="mt-1 break-words text-sm font-medium text-[var(--color-panel)]">
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function formatNumberish(value: number | null | undefined) {
  return value === null || value === undefined ? "-" : String(value);
}

function formatUnknownValue(value: unknown): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return formatFallback(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) {
    return value.length === 0 ? "-" : value.map(formatUnknownValue).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function RecordSummary({ title, record }: { title: string; record: Record<string, unknown> }) {
  const entries = Object.entries(record ?? {});

  return (
    <div className="border-t border-[var(--color-border)] first:border-t-0">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </div>
      {entries.length === 0 ? (
        <div className="px-4 py-4 text-sm text-[var(--color-text-muted)]">No data captured</div>
      ) : (
        <div className="grid md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="min-h-14 border-b border-[var(--color-border)] px-4 py-3 md:border-r md:[&:nth-child(2n)]:border-r-0"
            >
              <div className="text-xs text-[var(--color-text-muted)]">{key}</div>
              <div className="mt-1 break-words text-sm text-[var(--color-panel)]">
                {formatUnknownValue(value)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function statusesForControl(
  statuses: CoordinatorStatus[],
  category: CoordinatorStatusCategory,
  currentStatus: CoordinatorStatus,
) {
  const activeStatuses = filterStatusesByCategory(statuses, category);
  if (activeStatuses.some((status) => status.id === currentStatus.id)) return activeStatuses;
  return [...activeStatuses, currentStatus].sort(
    (left, right) => left.sortOrder - right.sortOrder || left.labelZh.localeCompare(right.labelZh),
  );
}

function AuditSummary({ adoptionCase }: { adoptionCase: AdoptionCaseDetail }) {
  const approvedMatches = findApprovedMatches(adoptionCase.matches);

  return (
    <Section title="Audit summary" subtitle="Summary from current case data">
      <DetailGrid
        items={[
          { label: "Current status", value: <StatusChip status={adoptionCase.status} /> },
          { label: "Created", value: formatDate(adoptionCase.createdAt) },
          { label: "Closed", value: formatDate(adoptionCase.closedAt) },
          { label: "Matches", value: String(adoptionCase.matches.length) },
          { label: "Approved matches", value: String(approvedMatches.length) },
          { label: "Follow-ups", value: String(adoptionCase.followups.length) },
          {
            label: "Finalized",
            value: adoptionCase.successfulAdoption
              ? adoptionCase.successfulAdoption.caseNumber
              : "Not finalized",
          },
          {
            label: "Adoption fee",
            value: formatHkdCents(adoptionCase.successfulAdoption?.adoptionFeeCents),
          },
        ]}
      />
    </Section>
  );
}

export function CaseDetail({ caseId }: CaseDetailProps) {
  const queryClient = useQueryClient();
  const [selectedStatusId, setSelectedStatusId] = useState("");
  const [statusNote, setStatusNote] = useState("");

  const caseQueryKey = useMemo(() => ["adoption-case", caseId] as const, [caseId]);

  const {
    data: caseData,
    error: caseError,
    isLoading: caseLoading,
    isFetching: caseFetching,
    refetch,
  } = useQuery<CaseDetailResponse, Error>({
    queryKey: caseQueryKey,
    queryFn: () =>
      fetchCoordinatorJson<CaseDetailResponse>(
        `/api/admin/adoptions/cases/${encodeURIComponent(caseId)}`,
      ),
  });

  const { data: statusesData, error: statusesError } = useQuery<StatusesResponse, Error>({
    queryKey: STATUSES_QUERY_KEY,
    queryFn: () => fetchCoordinatorJson<StatusesResponse>("/api/admin/adoptions/statuses"),
  });

  const adoptionCase = caseData?.case;
  const statuses = useMemo(() => statusesData?.statuses ?? [], [statusesData?.statuses]);

  useEffect(() => {
    if (!adoptionCase?.status.id) return;
    setSelectedStatusId(adoptionCase.status.id);
  }, [adoptionCase?.status.id]);

  const caseStatuses = useMemo(() => {
    if (!adoptionCase) return filterStatusesByCategory(statuses, "adoption_case");
    return statusesForControl(statuses, "adoption_case", adoptionCase.status);
  }, [adoptionCase, statuses]);

  async function invalidateCase() {
    await queryClient.invalidateQueries({ queryKey: caseQueryKey });
  }

  const statusMutation = useMutation<StatusUpdateResponse, Error, void>({
    mutationFn: () =>
      fetchCoordinatorJson<StatusUpdateResponse>(
        `/api/admin/adoptions/cases/${encodeURIComponent(caseId)}/status`,
        {
          method: "POST",
          body: JSON.stringify({
            statusId: selectedStatusId,
            note: statusNote.trim() || undefined,
          }),
        },
      ),
    onSuccess: async () => {
      setStatusNote("");
      await invalidateCase();
    },
  });

  function handleStatusSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedStatusId || statusMutation.isPending) return;
    statusMutation.mutate();
  }

  if (caseLoading) {
    return (
      <div className="space-y-5 p-6">
        <div className="h-8 w-52 rounded bg-[var(--color-lavender)]" />
        <section className={sectionClassName()}>
          <div className="h-14 border-b border-[var(--color-border)]" />
          <div className="grid gap-3 p-4 md:grid-cols-3">
            {Array.from({ length: 6 }, (_, index) => (
              <div key={index} className="h-12 rounded bg-[var(--color-lavender)]" />
            ))}
          </div>
        </section>
      </div>
    );
  }

  if (caseError || !adoptionCase) {
    return (
      <div className="space-y-5 p-6">
        <Link
          to="/admin/applications"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to cases
        </Link>
        <section className={sectionClassName()}>
          <div className="p-4 text-[var(--color-error)]" role="alert">
            {caseError?.message ?? "Case not found"}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="space-y-5 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-2">
          <Link
            to="/admin/applications"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to cases
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-panel)]">
              {adoptionCase.applicantName}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {formatFallback(adoptionCase.requestedAnimalName)} ·{" "}
              {formatDate(adoptionCase.createdAt)}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={caseFetching}>
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      {statusesError && <CaseDetailStatusesError message={statusesError.message} />}

      <Section title="Applicant">
        <DetailGrid
          items={[
            { label: "Name", value: adoptionCase.applicantName },
            { label: "Phone", value: formatFallback(adoptionCase.applicantPhone) },
            { label: "Email", value: formatFallback(adoptionCase.applicantEmail) },
            { label: "Address", value: formatFallback(adoptionCase.applicantAddress) },
            { label: "Supporter ID", value: formatFallback(adoptionCase.supporterId) },
            { label: "Adopter profile ID", value: formatFallback(adoptionCase.adopterProfileId) },
          ]}
        />
      </Section>

      <Section title="Public submission">
        <DetailGrid
          items={[
            { label: "Requested animal", value: formatFallback(adoptionCase.requestedAnimalName) },
            { label: "Animal type", value: formatFallback(adoptionCase.animalType) },
            { label: "Housing type", value: formatFallback(adoptionCase.housingType) },
            { label: "Family size", value: formatNumberish(adoptionCase.familySize) },
            { label: "Existing pets", value: formatFallback(adoptionCase.existingPets) },
            { label: "Submitted", value: formatDate(adoptionCase.createdAt) },
            { label: "Closed", value: formatDate(adoptionCase.closedAt) },
            { label: "Current status", value: <StatusChip status={adoptionCase.status} /> },
          ]}
        />
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <div className="text-xs text-[var(--color-text-muted)]">Reason</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-panel)]">
            {formatFallback(adoptionCase.reason)}
          </p>
        </div>
      </Section>

      <Section title="Assessment and preferences">
        <RecordSummary title="Assessment" record={adoptionCase.assessment} />
        <RecordSummary title="Preferences" record={adoptionCase.preferences} />
      </Section>

      <Section title="Status controls">
        <form
          onSubmit={handleStatusSubmit}
          className="grid gap-4 p-4 lg:grid-cols-[260px_1fr_auto]"
        >
          <div className="space-y-1.5">
            <Label htmlFor="case-status">Case status</Label>
            <Select value={selectedStatusId} onValueChange={setSelectedStatusId}>
              <SelectTrigger id="case-status" className="h-9">
                <SelectValue placeholder="Choose status" />
              </SelectTrigger>
              <SelectContent>
                {caseStatuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {status.labelZh} / {status.labelEn}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="case-status-note">Note</Label>
            <Textarea
              id="case-status-note"
              value={statusNote}
              onChange={(event) => setStatusNote(event.target.value)}
              className="min-h-9"
              placeholder="Optional status note"
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={!selectedStatusId || statusMutation.isPending}>
              <Save className="h-4 w-4" />
              Save status
            </Button>
          </div>
          {statusMutation.error && (
            <p className="text-sm text-[var(--color-error)]" role="alert">
              {statusMutation.error.message}
            </p>
          )}
        </form>
      </Section>

      <MatchPanel
        caseId={caseId}
        matches={adoptionCase.matches}
        statuses={statuses}
        onChanged={invalidateCase}
      />

      <TaskPanel
        adoptionCaseId={caseId}
        tasks={adoptionCase.followups}
        statuses={statuses}
        onChanged={invalidateCase}
      />

      <FinalizationPanel
        caseId={caseId}
        matches={adoptionCase.matches}
        statuses={statuses}
        successfulAdoption={adoptionCase.successfulAdoption}
        onChanged={invalidateCase}
      />

      <AuditSummary adoptionCase={adoptionCase} />
    </div>
  );
}
