import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Image, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

import { adminErrorMessage } from "../../../lib/admin/session";
import type {
  AdoptionCaseDetail,
  CoordinatorStatus,
  CoordinatorStatusCategory,
  PublicAdoptionPhoto,
} from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import type { AdminLanguage } from "../adminI18n";
import {
  bilingualStatusName,
  formatAdminNumber,
  statusDisplayName,
  useAdminPageCopy,
} from "../adminPageCopy";
import { useAdminCopy } from "../i18n/copy";
import { LoadFailure } from "../LoadFailure";
import { fetchCoordinatorJson } from "./api";
import { openPendingPhotoWindow, openSignedPhotoUrl } from "./caseDetailPhotoWindow";
import { caseDetailCopy } from "./caseDetailCopy";
import { filterStatusesByCategory, findApprovedMatches, formatFallback } from "./caseWorkflowLogic";
import { adoptionFormatCopy } from "./formatCopy";
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

type CaseDetailCopy = (typeof caseDetailCopy)["zh"];

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

export function CaseDetailStatusesError({
  message,
  error,
  onRetry,
}: {
  message: string;
  error: unknown;
  onRetry: () => void;
}) {
  const copy = useAdminCopy(caseDetailCopy);

  return <LoadFailure error={error} onRetry={onRetry} title={copy.statusesError(message)} />;
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

function formatUnknownValue(value: unknown, copy: CaseDetailCopy): string {
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return formatFallback(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? copy.yes : copy.no;
  if (Array.isArray(value)) {
    return value.length === 0
      ? "-"
      : value.map((item) => formatUnknownValue(item, copy)).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function RecordSummary({ title, record }: { title: string; record: Record<string, unknown> }) {
  const entries = Object.entries(record ?? {});
  const copy = useAdminCopy(caseDetailCopy);

  return (
    <div className="border-t border-[var(--color-border)] first:border-t-0">
      <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--color-text-muted)]">
        {title}
      </div>
      {entries.length === 0 ? (
        <div className="px-4 py-4 text-sm text-[var(--color-text-muted)]">
          {copy.noDataCaptured}
        </div>
      ) : (
        <div className="grid md:grid-cols-2">
          {entries.map(([key, value]) => (
            <div
              key={key}
              className="min-h-14 border-b border-[var(--color-border)] px-4 py-3 md:border-r md:[&:nth-child(2n)]:border-r-0"
            >
              <div className="text-xs text-[var(--color-text-muted)]">{key}</div>
              <div className="mt-1 break-words text-sm text-[var(--color-panel)]">
                {formatUnknownValue(value, copy)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function objectRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function PublicPhotoButton({ photo }: { photo: PublicAdoptionPhoto }) {
  const { language } = useAdminPageCopy();
  const copy = useAdminCopy(caseDetailCopy);

  const mutation = useMutation<{ url: string }, Error, void>({
    mutationFn: () =>
      fetchCoordinatorJson<{ url: string }>(
        `/api/admin/adoptions/applications/${encodeURIComponent(
          photo.publicApplicationId,
        )}/photos/${encodeURIComponent(photo.id)}`,
      ),
  });

  function openPhoto() {
    const opened = openPendingPhotoWindow();

    mutation.mutate(undefined, {
      onSuccess: ({ url }) => {
        openSignedPhotoUrl(url, opened);
      },
      onError: () => {
        opened?.close();
      },
    });
  }

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={openPhoto}
        disabled={mutation.isPending}
      >
        <ExternalLink className="h-4 w-4" />
        {mutation.isPending ? copy.openingPhoto : copy.openPhoto}
      </Button>
      {mutation.error && (
        <p className="text-xs text-[var(--color-error)]" role="alert">
          {copy.photoOpenFailed(adminErrorMessage(mutation.error, language) ?? "")}
        </p>
      )}
    </div>
  );
}

function PublicAdoptionSections({ adoptionCase }: { adoptionCase: AdoptionCaseDetail }) {
  const { pageCopy } = useAdminPageCopy();
  const copy = useAdminCopy(caseDetailCopy);
  const format = useAdminCopy(adoptionFormatCopy);
  const publicAdoption = adoptionCase.publicAdoption;

  if (!publicAdoption) return null;

  const questionnaire = publicAdoption.questionnaire ?? {};

  return (
    <>
      <Section title={copy.sections.rankedAnimalPreferences}>
        {publicAdoption.animalPreferences.length === 0 ? (
          <div className="px-4 py-4 text-sm text-[var(--color-text-muted)]">
            {copy.noPublicDetail}
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {publicAdoption.animalPreferences.map((preference) => (
              <div
                key={preference.id}
                className="grid gap-3 px-4 py-3 text-sm md:grid-cols-[80px_1fr_120px]"
              >
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">{copy.labels.rank}</div>
                  <div className="font-semibold text-[var(--color-panel)]">#{preference.rank}</div>
                </div>
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">{copy.labels.animal}</div>
                  <div className="font-medium text-[var(--color-panel)]">
                    {preference.animalNameSnapshot}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[var(--color-text-muted)]">{copy.labels.type}</div>
                  <div className="font-medium text-[var(--color-panel)]">
                    {pageCopy.animalTypes[preference.animalTypeSnapshot]}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={copy.sections.visitPreferences}>
        {publicAdoption.visitPreference ? (
          <DetailGrid
            items={[
              {
                label: copy.labels.dateRange,
                value: format.dateRange(
                  publicAdoption.visitPreference.dateRangeStart,
                  publicAdoption.visitPreference.dateRangeEnd,
                ),
              },
              {
                label: copy.labels.timeWindows,
                value: publicAdoption.visitPreference.preferredTimeWindows.join(", "),
              },
              {
                label: copy.labels.note,
                value: formatFallback(publicAdoption.visitPreference.notes),
              },
            ]}
          />
        ) : (
          <div className="px-4 py-4 text-sm text-[var(--color-text-muted)]">
            {copy.noVisitPreference}
          </div>
        )}
      </Section>

      <Section title={copy.sections.questionnaire}>
        <DetailGrid
          items={[
            { label: copy.labels.language, value: publicAdoption.language },
            {
              label: copy.labels.preferredContactMethod,
              value: copy.contactMethods[publicAdoption.preferredContactMethod],
            },
            { label: copy.labels.termsVersion, value: publicAdoption.termsVersion },
          ]}
        />
        <RecordSummary
          title={copy.questionnaireGroups.contact}
          record={objectRecord(questionnaire.contact)}
        />
        <RecordSummary
          title={copy.questionnaireGroups.home}
          record={objectRecord(questionnaire.home)}
        />
        <RecordSummary
          title={copy.questionnaireGroups.readiness}
          record={objectRecord(questionnaire.readiness)}
        />
      </Section>

      <Section title={copy.sections.photos}>
        {publicAdoption.photos.length === 0 ? (
          <div className="px-4 py-4 text-sm text-[var(--color-text-muted)]">{copy.noPhotos}</div>
        ) : (
          <div className="divide-y divide-[var(--color-border)]">
            {publicAdoption.photos.map((photo) => (
              <div
                key={photo.id}
                className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_180px_auto] md:items-center"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <Image className="h-4 w-4 text-[var(--color-text-muted)]" />
                    <div className="truncate text-sm font-semibold text-[var(--color-panel)]">
                      {photo.fileName}
                    </div>
                  </div>
                  <div className="mt-1 text-xs text-[var(--color-text-muted)]">
                    {copy.photoCategories[photo.photoCategory]} · {photo.mimeType} ·{" "}
                    {formatBytes(photo.sizeBytes)}
                  </div>
                </div>
                <div className="text-xs text-[var(--color-text-muted)]">
                  {copy.labels.uploaded}: {format.date(photo.uploadedAt)}
                </div>
                <PublicPhotoButton photo={photo} />
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title={copy.sections.statusLink}>
        {publicAdoption.statusToken ? (
          <DetailGrid
            items={[
              {
                label: copy.labels.currentStatus,
                value: publicAdoption.statusToken.revokedAt
                  ? copy.revokedStatusLink
                  : copy.activeStatusLink,
              },
              {
                label: copy.labels.expiresAt,
                value: format.date(publicAdoption.statusToken.expiresAt),
              },
              {
                label: copy.labels.revokedAt,
                value: format.date(publicAdoption.statusToken.revokedAt),
              },
              {
                label: copy.labels.lastViewedAt,
                value: format.date(publicAdoption.statusToken.lastViewedAt),
              },
            ]}
          />
        ) : (
          <div className="px-4 py-4 text-sm text-[var(--color-text-muted)]">
            {copy.noStatusToken}
          </div>
        )}
      </Section>
    </>
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

function AuditSummary({
  adoptionCase,
  language,
}: {
  adoptionCase: AdoptionCaseDetail;
  language: AdminLanguage;
}) {
  const approvedMatches = findApprovedMatches(adoptionCase.matches);
  const copy = useAdminCopy(caseDetailCopy);
  const format = useAdminCopy(adoptionFormatCopy);

  return (
    <Section title={copy.auditSummary} subtitle={copy.auditSubtitle}>
      <DetailGrid
        items={[
          { label: copy.labels.currentStatus, value: <StatusChip status={adoptionCase.status} /> },
          { label: copy.labels.created, value: format.date(adoptionCase.createdAt) },
          { label: copy.labels.closed, value: format.date(adoptionCase.closedAt) },
          {
            label: copy.labels.matches,
            value: formatAdminNumber(adoptionCase.matches.length, language),
          },
          {
            label: copy.labels.approvedMatches,
            value: formatAdminNumber(approvedMatches.length, language),
          },
          {
            label: copy.labels.followups,
            value: formatAdminNumber(adoptionCase.followups.length, language),
          },
          {
            label: copy.labels.finalized,
            value: adoptionCase.successfulAdoption
              ? adoptionCase.successfulAdoption.caseNumber
              : copy.notFinalized,
          },
          {
            label: copy.labels.adoptionFee,
            value: format.money(adoptionCase.successfulAdoption?.adoptionFeeCents),
          },
        ]}
      />
    </Section>
  );
}

export function CaseDetail({ caseId }: CaseDetailProps) {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = useAdminCopy(caseDetailCopy);
  const format = useAdminCopy(adoptionFormatCopy);
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

  const {
    data: statusesData,
    error: statusesError,
    refetch: refetchStatuses,
  } = useQuery<StatusesResponse, Error>({
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

  if (caseError) {
    return (
      <div className="space-y-5 p-6">
        <Link
          to="/admin/applications"
          className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy.backToCases}
        </Link>
        <section className={sectionClassName()}>
          <LoadFailure error={caseError} onRetry={() => void refetch()} className="border-0" />
        </section>
      </div>
    );
  }

  if (!adoptionCase) {
    return (
      <div className="space-y-5 p-6">
        <Link
          to="/admin/applications"
          className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy.backToCases}
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
            to="/admin/applications"
            className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            {copy.backToCases}
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-panel)]">
              {adoptionCase.applicantName}
            </h1>
            <p className="text-sm text-[var(--color-text-muted)]">
              {formatFallback(adoptionCase.requestedAnimalName)} ·{" "}
              {format.date(adoptionCase.createdAt)}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={caseFetching}>
          <RefreshCw className="h-4 w-4" />
          {copy.refresh}
        </Button>
      </div>

      {/* admin-load-failure-ok: CaseDetailStatusesError renders a LoadFailure with the retry */}
      {statusesError && (
        <CaseDetailStatusesError
          // admin-load-failure-ok: only the heading of the LoadFailure that CaseDetailStatusesError renders
          message={adminErrorMessage(statusesError, language) ?? ""}
          error={statusesError}
          onRetry={() => void refetchStatuses()}
        />
      )}

      <Section title={copy.sections.applicant}>
        <DetailGrid
          items={[
            { label: copy.labels.name, value: adoptionCase.applicantName },
            { label: copy.labels.phone, value: formatFallback(adoptionCase.applicantPhone) },
            { label: copy.labels.email, value: formatFallback(adoptionCase.applicantEmail) },
            { label: copy.labels.address, value: formatFallback(adoptionCase.applicantAddress) },
            { label: copy.labels.supporterId, value: formatFallback(adoptionCase.supporterId) },
            {
              label: copy.labels.adopterProfileId,
              value: formatFallback(adoptionCase.adopterProfileId),
            },
          ]}
        />
      </Section>

      <Section title={copy.sections.publicSubmission}>
        <DetailGrid
          items={[
            {
              label: copy.labels.requestedAnimal,
              value: formatFallback(adoptionCase.requestedAnimalName),
            },
            {
              label: copy.labels.animalType,
              value:
                pageCopy.animalTypes[
                  adoptionCase.animalType as keyof typeof pageCopy.animalTypes
                ] ?? formatFallback(adoptionCase.animalType),
            },
            { label: copy.labels.housingType, value: formatFallback(adoptionCase.housingType) },
            { label: copy.labels.familySize, value: formatNumberish(adoptionCase.familySize) },
            { label: copy.labels.existingPets, value: formatFallback(adoptionCase.existingPets) },
            { label: copy.labels.submitted, value: format.date(adoptionCase.createdAt) },
            { label: copy.labels.closed, value: format.date(adoptionCase.closedAt) },
            {
              label: copy.labels.currentStatus,
              value: <StatusChip status={adoptionCase.status} />,
            },
          ]}
        />
        <div className="border-t border-[var(--color-border)] px-4 py-3">
          <div className="text-xs text-[var(--color-text-muted)]">{copy.labels.reason}</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--color-panel)]">
            {formatFallback(adoptionCase.reason)}
          </p>
        </div>
      </Section>

      <PublicAdoptionSections adoptionCase={adoptionCase} />

      <Section title={copy.sections.assessmentPreferences}>
        <RecordSummary title={copy.labels.assessment} record={adoptionCase.assessment} />
        <RecordSummary title={copy.labels.preferences} record={adoptionCase.preferences} />
      </Section>

      <Section title={copy.sections.statusControls}>
        <form
          onSubmit={handleStatusSubmit}
          className="grid gap-4 p-4 lg:grid-cols-[260px_1fr_auto]"
        >
          <div className="space-y-1.5">
            <Label htmlFor="case-status">{copy.labels.caseStatus}</Label>
            <Select value={selectedStatusId} onValueChange={setSelectedStatusId}>
              <SelectTrigger id="case-status" className="h-9">
                <SelectValue placeholder={copy.chooseStatus} />
              </SelectTrigger>
              <SelectContent>
                {caseStatuses.map((status) => (
                  <SelectItem key={status.id} value={status.id}>
                    {bilingualStatusName(status, language)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="case-status-note">{copy.labels.note}</Label>
            <Textarea
              id="case-status-note"
              value={statusNote}
              onChange={(event) => setStatusNote(event.target.value)}
              className="min-h-9"
              placeholder={copy.optionalStatusNote}
            />
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={!selectedStatusId || statusMutation.isPending}>
              <Save className="h-4 w-4" />
              {copy.saveStatus}
            </Button>
          </div>
          {statusMutation.error && (
            <p className="text-sm text-[var(--color-error)]" role="alert">
              {adminErrorMessage(statusMutation.error, language) ?? ""}
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
        tasks={adoptionCase.followups}
        statuses={statuses}
        defaultLinks={{ adoptionCaseId: caseId }}
        onChanged={invalidateCase}
      />

      <FinalizationPanel
        caseId={caseId}
        matches={adoptionCase.matches}
        statuses={statuses}
        successfulAdoption={adoptionCase.successfulAdoption}
        onChanged={invalidateCase}
      />

      <AuditSummary adoptionCase={adoptionCase} language={language} />
    </div>
  );
}
