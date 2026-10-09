import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, RefreshCw } from "lucide-react";
import { useMemo } from "react";
import type { ReactNode } from "react";

import { adminErrorMessage } from "../../../lib/admin/session";
import type {
  AdopterDetail as AdopterDetailData,
  CoordinatorStatus,
} from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { DataTable, type DataTableColumn } from "../DataTable";
import type { AdminLanguage } from "../adminI18n";
import { formatAdminNumber, statusDisplayName, useAdminPageCopy } from "../adminPageCopy";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { adopterDetailCopy } from "./adopterDetailCopy";
import { fetchCoordinatorJson } from "./api";
import { formatFallback } from "./caseWorkflowLogic";
import { adoptionFormatCopy } from "./formatCopy";
import { TaskPanel, TaskPanelAsyncError } from "./TaskPanel";

type AdopterCaseHistoryRow = AdopterDetailData["cases"][number];
type AdopterSuccessfulAdoptionRow = AdopterDetailData["successfulAdoptions"][number];

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

type AdopterDetailCopy = (typeof adopterDetailCopy)["zh"];

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

function formatCount(value: number, language: AdminLanguage) {
  return formatAdminNumber(value, language);
}

function formatConsentStatus(status: AdopterDetailData["emailConsent"], copy: AdopterDetailCopy) {
  if (status === "opt_in") return copy.optedIn;
  if (status === "opt_out") return copy.optedOut;
  return formatFallback(null);
}

function latestCaseStatusText(
  latestCase: AdopterDetailData["latestCase"],
  language: AdminLanguage,
) {
  if (!latestCase) return null;
  return statusDisplayName(latestCase.status, language);
}

function LatestCaseLink({
  latestCase,
  language,
}: {
  latestCase: AdopterDetailData["latestCase"];
  language: AdminLanguage;
}) {
  const { pageCopy } = useAdminPageCopy();
  const format = useAdminCopy(adoptionFormatCopy);

  if (!latestCase) return format.date(null);

  const animalType =
    pageCopy.animalTypes[latestCase.animalType as keyof typeof pageCopy.animalTypes] ??
    formatFallback(latestCase.animalType);

  return (
    <div className="space-y-1">
      <Link
        to="/admin/applications/$id"
        params={{ id: latestCase.id }}
        className="font-medium text-[var(--color-primary)] hover:underline"
      >
        {format.date(latestCase.createdAt)}
      </Link>
      <div className="text-xs text-[var(--color-text-muted)]">
        {latestCaseStatusText(latestCase, language)} · {animalType}
        {latestCase.requestedAnimalName ? ` · ${latestCase.requestedAnimalName}` : ""}
      </div>
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
      <span>{statusDisplayName(status, language)}</span>
    </Badge>
  );
}

function BlacklistBadge({ isBlacklisted }: { isBlacklisted: boolean }) {
  const copy = useAdminCopy(adopterDetailCopy);

  if (isBlacklisted) {
    return (
      <Badge
        variant="outline"
        className="border-[var(--color-error)] bg-[var(--color-surface-2)] text-[var(--color-error)]"
      >
        {copy.blacklisted}
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
    >
      {copy.clear}
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
  const { language, pageCopy } = useAdminPageCopy();
  const copy = useAdminCopy(adopterDetailCopy);
  const format = useAdminCopy(adoptionFormatCopy);
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

  const caseHistoryColumns: DataTableColumn<AdopterCaseHistoryRow>[] = [
    {
      id: "applicant",
      header: copy.labels.applicant,
      className: "min-w-56 px-4",
      cell: (c) => (
        <div>
          <Link
            to="/admin/applications/$id"
            params={{ id: c.id }}
            className="font-semibold text-[var(--color-primary)] hover:underline"
          >
            {c.applicantName}
          </Link>
          <div className="text-xs text-[var(--color-text-muted)]">
            {pageCopy.animalTypes[c.animalType as keyof typeof pageCopy.animalTypes] ??
              formatFallback(c.animalType)}
          </div>
        </div>
      ),
    },
    {
      id: "animal",
      header: copy.labels.requestedAnimal,
      className: "min-w-48",
      cell: (c) => (
        <div className="font-medium text-[var(--color-panel)]">
          {formatFallback(c.requestedAnimalName)}
        </div>
      ),
    },
    {
      id: "dates",
      header: copy.labels.dates,
      className: "min-w-40",
      cell: (c) => (
        <div className="text-xs text-[var(--color-text-muted)]">
          <div>
            {copy.labels.created}: {format.date(c.createdAt)}
          </div>
          <div>
            {copy.labels.closed}: {format.date(c.closedAt)}
          </div>
        </div>
      ),
    },
    {
      id: "status",
      header: copy.labels.status,
      className: "min-w-48",
      cell: (c) => <StatusChip status={c.status} />,
    },
    {
      id: "action",
      header: copy.labels.action,
      className: "w-32",
      cell: (c) => (
        <Link
          to="/admin/applications/$id"
          params={{ id: c.id }}
          className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--color-border)] px-3 text-xs font-medium text-[var(--color-panel)] hover:bg-[var(--color-surface-2)]"
        >
          {copy.labels.openCase}
        </Link>
      ),
    },
  ];

  function renderCaseHistoryCard(c: AdopterCaseHistoryRow) {
    return (
      <div className="space-y-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Link
              to="/admin/applications/$id"
              params={{ id: c.id }}
              className="font-semibold text-[var(--color-primary)] hover:underline"
            >
              {c.applicantName}
            </Link>
            <div className="text-xs text-[var(--color-text-muted)]">
              {pageCopy.animalTypes[c.animalType as keyof typeof pageCopy.animalTypes] ??
                formatFallback(c.animalType)}
            </div>
          </div>
          <StatusChip status={c.status} />
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {formatFallback(c.requestedAnimalName)}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {copy.labels.created}: {format.date(c.createdAt)} · {copy.labels.closed}:{" "}
          {format.date(c.closedAt)}
        </div>
      </div>
    );
  }

  const successfulAdoptionColumns: DataTableColumn<AdopterSuccessfulAdoptionRow>[] = [
    {
      id: "caseNumber",
      header: copy.labels.caseNumber,
      className: "min-w-44 px-4",
      cell: (a) => <span className="font-semibold text-[var(--color-panel)]">{a.caseNumber}</span>,
    },
    {
      id: "animal",
      header: copy.labels.animal,
      className: "min-w-48",
      cell: (a) => (
        <div>
          <div className="font-medium text-[var(--color-panel)]">
            {formatFallback(a.animalName)}
          </div>
          <div className="break-words text-xs text-[var(--color-text-muted)]">{a.animalId}</div>
        </div>
      ),
    },
    {
      id: "fee",
      header: copy.labels.fee,
      className: "min-w-32",
      cell: (a) => (
        <span className="text-[var(--color-panel)]">{format.money(a.adoptionFeeCents)}</span>
      ),
    },
    {
      id: "approval",
      header: copy.labels.approval,
      className: "min-w-40",
      cell: (a) => (
        <span className="text-[var(--color-text-muted)]">{format.date(a.approvalDate)}</span>
      ),
    },
    {
      id: "pickup",
      header: copy.labels.pickup,
      className: "min-w-40",
      cell: (a) => (
        <span className="text-[var(--color-text-muted)]">{format.date(a.pickupDate)}</span>
      ),
    },
  ];

  function renderSuccessfulAdoptionCard(a: AdopterSuccessfulAdoptionRow) {
    return (
      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <span className="font-semibold text-[var(--color-panel)]">{a.caseNumber}</span>
          <span className="text-sm text-[var(--color-panel)]">
            {format.money(a.adoptionFeeCents)}
          </span>
        </div>
        <div className="font-medium text-[var(--color-panel)]">{formatFallback(a.animalName)}</div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {copy.labels.approval}: {format.date(a.approvalDate)} · {copy.labels.pickup}:{" "}
          {format.date(a.pickupDate)}
        </div>
      </div>
    );
  }

  if (adopterLoading) return <LoadingState />;

  if (adopterError) {
    return (
      <div className="space-y-5 p-6">
        <Link
          to="/admin/coordinator/adopters"
          className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy.backToAdopters}
        </Link>
        <section className={sectionClassName()}>
          <LoadFailure error={adopterError} onRetry={() => void refetch()} className="border-0" />
        </section>
      </div>
    );
  }

  if (!adopter) {
    return (
      <div className="space-y-5 p-6">
        <Link
          to="/admin/coordinator/adopters"
          className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy.backToAdopters}
        </Link>
        <section className={sectionClassName()}>
          <div className="p-4 text-[var(--color-error)]" role="alert">
            {copy.notFound}
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
            className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.backToAdopters}
          </Link>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold text-[var(--color-panel)]">
                {adopter.displayName}
              </h1>
              <BlacklistBadge isBlacklisted={adopter.isBlacklisted} />
            </div>
            <p className="text-sm text-[var(--color-text-muted)]">
              {formatFallback(adopter.livingArea)} · {copy.latestCase}{" "}
              {format.date(adopter.latestCaseAt)}
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
          {copy.refresh}
        </Button>
      </div>

      <Section title={copy.sections.profile}>
        <DetailGrid
          items={[
            { label: copy.labels.displayName, value: adopter.displayName },
            { label: copy.labels.chineseName, value: formatFallback(adopter.nameChinese) },
            { label: copy.labels.englishName, value: formatFallback(adopter.nameEnglish) },
            { label: copy.labels.phone, value: formatFallback(adopter.phone) },
            { label: copy.labels.email, value: formatFallback(adopter.email) },
            { label: copy.labels.supporterId, value: formatFallback(adopter.supporterId) },
            { label: copy.labels.livingArea, value: formatFallback(adopter.livingArea) },
            {
              label: copy.labels.blacklistStatus,
              value: <BlacklistBadge isBlacklisted={adopter.isBlacklisted} />,
            },
            {
              label: copy.labels.emailConsent,
              value: formatConsentStatus(adopter.emailConsent, copy),
            },
            {
              label: copy.labels.whatsappConsent,
              value: formatConsentStatus(adopter.whatsappConsent, copy),
            },
            {
              label: copy.labels.latestCase,
              value: <LatestCaseLink latestCase={adopter.latestCase} language={language} />,
            },
          ]}
        />
        {adopter.isBlacklisted && (
          <div className="border-t border-[var(--color-border)] px-4 py-3">
            <div className="text-xs text-[var(--color-text-muted)]">
              {copy.labels.blacklistReason}
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-panel)]">
              {formatFallback(adopter.blacklistReason)}
            </p>
          </div>
        )}
      </Section>

      <Section title={copy.sections.activity}>
        <DetailGrid
          items={[
            { label: copy.labels.openCases, value: formatCount(adopter.openCaseCount, language) },
            {
              label: copy.labels.successfulAdoptions,
              value: formatCount(adopter.successfulAdoptionCount, language),
            },
            {
              label: copy.labels.openFollowups,
              value: formatCount(adopter.openTaskCount, language),
            },
          ]}
        />
      </Section>

      <Section title={copy.sections.household}>
        <DetailGrid
          items={[
            { label: copy.labels.gender, value: formatFallback(adopter.gender) },
            { label: copy.labels.birthday, value: format.date(adopter.birthday) },
            { label: copy.labels.occupation, value: formatFallback(adopter.occupation) },
            { label: copy.labels.facebook, value: formatFallback(adopter.facebook) },
            { label: copy.labels.householdSize, value: formatFallback(adopter.householdSize) },
            {
              label: copy.labels.monthlyHouseholdIncome,
              value: formatFallback(adopter.monthlyHouseholdIncome),
            },
            { label: copy.labels.floorArea, value: formatFallback(adopter.floorArea) },
            { label: copy.labels.address, value: formatFallback(adopter.address) },
          ]}
        />
      </Section>

      <Section title={copy.sections.caseHistory} subtitle={copy.linkedCases(adopter.cases.length)}>
        <DataTable<AdopterCaseHistoryRow>
          columns={caseHistoryColumns}
          rows={adopter.cases}
          getRowKey={(c) => c.id}
          empty={copy.noCaseHistory}
          renderMobileCard={renderCaseHistoryCard}
        />
      </Section>

      <Section
        title={copy.sections.successfulAdoptions}
        subtitle={copy.finalizedAdoptions(adopter.successfulAdoptions.length)}
      >
        <DataTable<AdopterSuccessfulAdoptionRow>
          columns={successfulAdoptionColumns}
          rows={adopter.successfulAdoptions}
          getRowKey={(a) => a.id}
          empty={copy.noSuccessfulAdoptions}
          renderMobileCard={renderSuccessfulAdoptionCard}
        />
      </Section>

      {statusesError && (
        <section className={sectionClassName()}>
          <TaskPanelAsyncError
            message={copy.loadFollowupStatusesError(
              adminErrorMessage(statusesError, language) ?? "",
            )}
          />
          <div className="px-4 py-3 text-sm text-[var(--color-text-muted)]">
            {copy.followupStatusHint}
          </div>
        </section>
      )}

      <TaskPanel
        title={copy.adopterFollowups}
        tasks={adopter.tasks}
        statuses={statuses}
        defaultLinks={{ adopterProfileId: adopter.id }}
        onChanged={invalidateAdopter}
      />
    </div>
  );
}
