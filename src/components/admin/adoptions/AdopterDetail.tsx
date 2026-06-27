import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";

import type {
  AdopterDetail as AdopterDetailData,
  CoordinatorStatus,
} from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../ui/table";
import { fetchCoordinatorJson } from "./api";
import { formatDate, formatFallback, formatHkdCents } from "./caseWorkflowLogic";
import { TaskPanel, TaskPanelAsyncError } from "./TaskPanel";

type AdopterDetailProps = {
  adopterId: string;
};

type AdopterDetailResponse = {
  adopter: AdopterDetailData;
};

type StatusesResponse = {
  statuses: CoordinatorStatus[];
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

function formatCount(value: number) {
  return value.toLocaleString("en-US");
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

function BlacklistBadge({ isBlacklisted }: { isBlacklisted: boolean }) {
  if (isBlacklisted) {
    return (
      <Badge
        variant="outline"
        className="border-[var(--color-error)] bg-[var(--color-surface-2)] text-[var(--color-error)]"
      >
        Blacklisted
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
    >
      Clear
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

function LoadingState() {
  return (
    <div className="space-y-5 p-6">
      <div className="h-8 w-56 rounded bg-[var(--color-lavender)]" />
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

export function AdopterDetail({ adopterId }: AdopterDetailProps) {
  const queryClient = useQueryClient();
  const adopterQueryKey = useMemo(() => ["adopter-profile", adopterId] as const, [adopterId]);

  const {
    data: adopterData,
    error: adopterError,
    isLoading: adopterLoading,
    isFetching: adopterFetching,
    refetch,
  } = useQuery<AdopterDetailResponse, Error>({
    queryKey: adopterQueryKey,
    queryFn: () =>
      fetchCoordinatorJson<AdopterDetailResponse>(
        `/api/admin/adoptions/adopters/${encodeURIComponent(adopterId)}`,
      ),
  });

  const { data: statusesData, error: statusesError } = useQuery<StatusesResponse, Error>({
    queryKey: STATUSES_QUERY_KEY,
    queryFn: () => fetchCoordinatorJson<StatusesResponse>("/api/admin/adoptions/statuses"),
  });

  const adopter = adopterData?.adopter;
  const statuses = useMemo(() => statusesData?.statuses ?? [], [statusesData?.statuses]);

  async function invalidateAdopter() {
    await queryClient.invalidateQueries({ queryKey: adopterQueryKey });
  }

  if (adopterLoading) return <LoadingState />;

  if (adopterError || !adopter) {
    return (
      <div className="space-y-5 p-6">
        <Link
          to="/admin/coordinator/adopters"
          className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to adopters
        </Link>
        <section className={sectionClassName()}>
          <div className="p-4 text-[var(--color-error)]" role="alert">
            {adopterError?.message ?? "Adopter profile not found"}
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
            to="/admin/coordinator/adopters"
            className="inline-flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to adopters
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--color-panel)]">
                {adopter.displayName}
              </h1>
              <BlacklistBadge isBlacklisted={adopter.isBlacklisted} />
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              {formatFallback(adopter.livingArea)} · Latest case {formatDate(adopter.latestCaseAt)}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => refetch()}
          disabled={adopterFetching}
        >
          <RefreshCw className="h-4 w-4" />
          Refresh
        </Button>
      </div>

      <Section title="Profile summary">
        <DetailGrid
          items={[
            { label: "Display name", value: adopter.displayName },
            { label: "Chinese name", value: formatFallback(adopter.nameChinese) },
            { label: "English name", value: formatFallback(adopter.nameEnglish) },
            { label: "Phone", value: formatFallback(adopter.phone) },
            { label: "Email", value: formatFallback(adopter.email) },
            { label: "Supporter ID", value: formatFallback(adopter.supporterId) },
            { label: "Living area", value: formatFallback(adopter.livingArea) },
            { label: "Blacklist status", value: <BlacklistBadge isBlacklisted={adopter.isBlacklisted} /> },
            { label: "Latest case", value: formatDate(adopter.latestCaseAt) },
          ]}
        />
        {adopter.isBlacklisted && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <div className="text-xs text-[var(--color-text-muted)]">Blacklist reason</div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-panel)]">
              {formatFallback(adopter.blacklistReason)}
            </p>
          </div>
        )}
      </Section>

      <Section title="Activity">
        <DetailGrid
          items={[
            { label: "Open cases", value: formatCount(adopter.openCaseCount) },
            {
              label: "Successful adoptions",
              value: formatCount(adopter.successfulAdoptionCount),
            },
            { label: "Open follow-ups", value: formatCount(adopter.openTaskCount) },
          ]}
        />
      </Section>

      <Section title="Household details">
        <DetailGrid
          items={[
            { label: "Gender", value: formatFallback(adopter.gender) },
            { label: "Birthday", value: formatDate(adopter.birthday) },
            { label: "Occupation", value: formatFallback(adopter.occupation) },
            { label: "Facebook", value: formatFallback(adopter.facebook) },
            { label: "Household size", value: formatFallback(adopter.householdSize) },
            {
              label: "Monthly household income",
              value: formatFallback(adopter.monthlyHouseholdIncome),
            },
            { label: "Floor area", value: formatFallback(adopter.floorArea) },
            { label: "Address", value: formatFallback(adopter.address) },
          ]}
        />
      </Section>

      <Section title="Case history" subtitle={`${adopter.cases.length} linked cases`}>
        <Table>
          <TableHeader>
            <TableRow className="h-11 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]">
              <TableHead className="min-w-56 px-4 text-[var(--color-text-muted)]">
                Applicant
              </TableHead>
              <TableHead className="min-w-48 text-[var(--color-text-muted)]">
                Requested animal
              </TableHead>
              <TableHead className="min-w-40 text-[var(--color-text-muted)]">Dates</TableHead>
              <TableHead className="min-w-48 text-[var(--color-text-muted)]">Status</TableHead>
              <TableHead className="w-32 text-[var(--color-text-muted)]">Action</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adopter.cases.length === 0 && (
              <TableRow className="h-16">
                <TableCell colSpan={5} className="px-4 text-[var(--color-text-muted)]">
                  No case history
                </TableCell>
              </TableRow>
            )}
            {adopter.cases.map((adoptionCase) => (
              <TableRow key={adoptionCase.id} className="h-16">
                <TableCell className="px-4">
                  <Link
                    to="/admin/applications/$id"
                    params={{ id: adoptionCase.id }}
                    className="font-semibold text-[var(--color-primary)] hover:underline"
                  >
                    {adoptionCase.applicantName}
                  </Link>
                  <div className="text-xs text-[var(--color-text-muted)]">
                    {formatFallback(adoptionCase.animalType)}
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium text-[var(--color-panel)]">
                    {formatFallback(adoptionCase.requestedAnimalName)}
                  </div>
                </TableCell>
                <TableCell className="text-xs text-[var(--color-text-muted)]">
                  <div>Created: {formatDate(adoptionCase.createdAt)}</div>
                  <div>Closed: {formatDate(adoptionCase.closedAt)}</div>
                </TableCell>
                <TableCell>
                  <StatusChip status={adoptionCase.status} />
                </TableCell>
                <TableCell>
                  <Link
                    to="/admin/applications/$id"
                    params={{ id: adoptionCase.id }}
                    className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-panel)] hover:bg-[var(--color-surface-2)]"
                  >
                    Open case
                  </Link>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      <Section
        title="Successful adoptions"
        subtitle={`${adopter.successfulAdoptions.length} finalized adoptions`}
      >
        <Table>
          <TableHeader>
            <TableRow className="h-11 bg-[var(--color-surface-2)] hover:bg-[var(--color-surface-2)]">
              <TableHead className="min-w-44 px-4 text-[var(--color-text-muted)]">
                Case number
              </TableHead>
              <TableHead className="min-w-48 text-[var(--color-text-muted)]">Animal</TableHead>
              <TableHead className="min-w-32 text-[var(--color-text-muted)]">Fee</TableHead>
              <TableHead className="min-w-40 text-[var(--color-text-muted)]">Approval</TableHead>
              <TableHead className="min-w-40 text-[var(--color-text-muted)]">Pickup</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {adopter.successfulAdoptions.length === 0 && (
              <TableRow className="h-16">
                <TableCell colSpan={5} className="px-4 text-[var(--color-text-muted)]">
                  No successful adoptions recorded
                </TableCell>
              </TableRow>
            )}
            {adopter.successfulAdoptions.map((adoption) => (
              <TableRow key={adoption.id} className="h-16">
                <TableCell className="px-4 font-semibold text-[var(--color-panel)]">
                  {adoption.caseNumber}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-[var(--color-panel)]">
                    {formatFallback(adoption.animalName)}
                  </div>
                  <div className="break-words text-xs text-[var(--color-text-muted)]">
                    {adoption.animalId}
                  </div>
                </TableCell>
                <TableCell className="text-[var(--color-panel)]">
                  {formatHkdCents(adoption.adoptionFeeCents)}
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)]">
                  {formatDate(adoption.approvalDate)}
                </TableCell>
                <TableCell className="text-[var(--color-text-muted)]">
                  {formatDate(adoption.pickupDate)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Section>

      {statusesError && (
        <section className={sectionClassName()}>
          <TaskPanelAsyncError message={`Could not load follow-up statuses: ${statusesError.message}`} />
          <div className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
            Existing follow-ups are shown below. Creating or editing tasks may need statuses.
          </div>
        </section>
      )}

      <TaskPanel
        title="Adopter follow-ups"
        tasks={adopter.tasks}
        statuses={statuses}
        defaultLinks={{ adopterProfileId: adopter.id }}
        onChanged={invalidateAdopter}
      />
    </div>
  );
}
