import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ArrowLeft, ExternalLink, Image, RefreshCw, Save } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";

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
import {
  bilingualStatusName,
  formatAdminNumber,
  statusDisplayName,
  useAdminPageCopy,
} from "../adminPageCopy";
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

const CASE_DETAIL_COPY = {
  zh: {
    backToCases: "返回個案",
    notFound: "找不到個案",
    refresh: "重新整理",
    statusesError: "無法載入狀態",
    noDataCaptured: "沒有紀錄資料",
    yes: "是",
    no: "否",
    notFinalized: "未完成",
    auditSummary: "審核摘要",
    auditSubtitle: "根據目前個案資料整理",
    sections: {
      applicant: "申請人",
      publicSubmission: "公開申請",
      rankedAnimalPreferences: "動物偏好排序",
      visitPreferences: "探訪偏好",
      questionnaire: "問卷資料",
      photos: "申請相片",
      statusLink: "狀態連結",
      assessmentPreferences: "評估及偏好",
      statusControls: "狀態控制",
    },
    labels: {
      currentStatus: "目前狀態",
      created: "建立日期",
      closed: "結束日期",
      matches: "配對",
      approvedMatches: "已批核配對",
      followups: "跟進工作",
      finalized: "完成狀態",
      adoptionFee: "領養費",
      name: "姓名",
      phone: "電話",
      email: "電郵",
      address: "地址",
      supporterId: "捐款人 ID",
      adopterProfileId: "領養人檔案 ID",
      requestedAnimal: "申請動物",
      animalType: "動物類別",
      housingType: "住所類別",
      familySize: "家庭人數",
      existingPets: "現有寵物",
      submitted: "提交日期",
      reason: "申請原因",
      assessment: "評估",
      preferences: "偏好",
      caseStatus: "個案狀態",
      note: "備註",
      rank: "排序",
      animal: "動物",
      type: "類別",
      dateRange: "日期範圍",
      timeWindows: "可選時段",
      language: "語言",
      preferredContactMethod: "偏好聯絡方式",
      termsVersion: "條款版本",
      fileName: "檔案",
      mimeType: "格式",
      size: "大小",
      uploaded: "上載時間",
      expiresAt: "到期",
      revokedAt: "撤銷",
      lastViewedAt: "最後查看",
    },
    questionnaireGroups: {
      contact: "聯絡",
      home: "家居",
      readiness: "準備",
    },
    photoCategories: {
      home: "家居",
      window: "窗戶",
      living: "生活空間",
    },
    contactMethods: {
      phone: "電話",
      whatsapp: "WhatsApp",
      email: "電郵",
    },
    noPublicDetail: "未有公開申請詳細資料",
    noVisitPreference: "未有探訪偏好",
    noPhotos: "未有相片",
    noStatusToken: "未有狀態連結紀錄",
    activeStatusLink: "有效",
    revokedStatusLink: "已撤銷",
    openPhoto: "開啟相片",
    openingPhoto: "開啟中...",
    photoOpenFailed: "無法開啟相片",
    chooseStatus: "選擇狀態",
    optionalStatusNote: "選填狀態備註",
    saveStatus: "儲存狀態",
  },
  en: {
    backToCases: "Back to cases",
    notFound: "Case not found",
    refresh: "Refresh",
    statusesError: "Could not load statuses",
    noDataCaptured: "No data captured",
    yes: "Yes",
    no: "No",
    notFinalized: "Not finalized",
    auditSummary: "Audit summary",
    auditSubtitle: "Summary from current case data",
    sections: {
      applicant: "Applicant",
      publicSubmission: "Public submission",
      rankedAnimalPreferences: "Ranked animal preferences",
      visitPreferences: "Visit preferences",
      questionnaire: "Questionnaire",
      photos: "Application photos",
      statusLink: "Status link",
      assessmentPreferences: "Assessment and preferences",
      statusControls: "Status controls",
    },
    labels: {
      currentStatus: "Current status",
      created: "Created",
      closed: "Closed",
      matches: "Matches",
      approvedMatches: "Approved matches",
      followups: "Follow-ups",
      finalized: "Finalized",
      adoptionFee: "Adoption fee",
      name: "Name",
      phone: "Phone",
      email: "Email",
      address: "Address",
      supporterId: "Supporter ID",
      adopterProfileId: "Adopter profile ID",
      requestedAnimal: "Requested animal",
      animalType: "Animal type",
      housingType: "Housing type",
      familySize: "Family size",
      existingPets: "Existing pets",
      submitted: "Submitted",
      reason: "Reason",
      assessment: "Assessment",
      preferences: "Preferences",
      caseStatus: "Case status",
      note: "Note",
      rank: "Rank",
      animal: "Animal",
      type: "Type",
      dateRange: "Date range",
      timeWindows: "Time windows",
      language: "Language",
      preferredContactMethod: "Preferred contact",
      termsVersion: "Terms version",
      fileName: "File",
      mimeType: "Format",
      size: "Size",
      uploaded: "Uploaded",
      expiresAt: "Expires",
      revokedAt: "Revoked",
      lastViewedAt: "Last viewed",
    },
    questionnaireGroups: {
      contact: "Contact",
      home: "Home",
      readiness: "Readiness",
    },
    photoCategories: {
      home: "Home",
      window: "Window",
      living: "Living space",
    },
    contactMethods: {
      phone: "Phone",
      whatsapp: "WhatsApp",
      email: "Email",
    },
    noPublicDetail: "No public application detail captured",
    noVisitPreference: "No visit preference captured",
    noPhotos: "No photos uploaded",
    noStatusToken: "No status-link record",
    activeStatusLink: "Active",
    revokedStatusLink: "Revoked",
    openPhoto: "Open photo",
    openingPhoto: "Opening...",
    photoOpenFailed: "Could not open photo",
    chooseStatus: "Choose status",
    optionalStatusNote: "Optional status note",
    saveStatus: "Save status",
  },
} as const;

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

export function CaseDetailStatusesError({ message }: { message: string }) {
  const { language } = useAdminPageCopy();
  const copy = CASE_DETAIL_COPY[language];

  return (
    <div
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-2 text-sm text-[var(--color-error)]"
      role="alert"
    >
      {copy.statusesError}: {message}
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

function formatUnknownValue(value: unknown, language: keyof typeof CASE_DETAIL_COPY): string {
  const copy = CASE_DETAIL_COPY[language];
  if (value === null || value === undefined) return "-";
  if (typeof value === "string") return formatFallback(value);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? copy.yes : copy.no;
  if (Array.isArray(value)) {
    return value.length === 0
      ? "-"
      : value.map((item) => formatUnknownValue(item, language)).join(", ");
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function RecordSummary({
  title,
  record,
  language,
}: {
  title: string;
  record: Record<string, unknown>;
  language: keyof typeof CASE_DETAIL_COPY;
}) {
  const entries = Object.entries(record ?? {});
  const copy = CASE_DETAIL_COPY[language];

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
                {formatUnknownValue(value, language)}
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
  const copy = CASE_DETAIL_COPY[language];

  const mutation = useMutation<{ url: string }, Error, void>({
    mutationFn: () =>
      fetchCoordinatorJson<{ url: string }>(
        `/api/admin/adoptions/applications/${encodeURIComponent(
          photo.publicApplicationId,
        )}/photos/${encodeURIComponent(photo.id)}`,
      ),
  });

  function openPhoto() {
    const opened = window.open("", "_blank", "noopener,noreferrer");
    if (opened) opened.opener = null;

    mutation.mutate(undefined, {
      onSuccess: ({ url }) => {
        if (opened) {
          opened.location.href = url;
          return;
        }
        const fallback = window.open(url, "_blank", "noopener,noreferrer");
        if (fallback) fallback.opener = null;
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
          {copy.photoOpenFailed}: {mutation.error.message}
        </p>
      )}
    </div>
  );
}

function PublicAdoptionSections({ adoptionCase }: { adoptionCase: AdoptionCaseDetail }) {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = CASE_DETAIL_COPY[language];
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
                value: `${publicAdoption.visitPreference.dateRangeStart} - ${publicAdoption.visitPreference.dateRangeEnd}`,
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
          language={language}
        />
        <RecordSummary
          title={copy.questionnaireGroups.home}
          record={objectRecord(questionnaire.home)}
          language={language}
        />
        <RecordSummary
          title={copy.questionnaireGroups.readiness}
          record={objectRecord(questionnaire.readiness)}
          language={language}
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
                  {copy.labels.uploaded}: {formatDate(photo.uploadedAt)}
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
                value: formatDate(publicAdoption.statusToken.expiresAt),
              },
              {
                label: copy.labels.revokedAt,
                value: formatDate(publicAdoption.statusToken.revokedAt),
              },
              {
                label: copy.labels.lastViewedAt,
                value: formatDate(publicAdoption.statusToken.lastViewedAt),
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
  language: keyof typeof CASE_DETAIL_COPY;
}) {
  const approvedMatches = findApprovedMatches(adoptionCase.matches);
  const copy = CASE_DETAIL_COPY[language];

  return (
    <Section title={copy.auditSummary} subtitle={copy.auditSubtitle}>
      <DetailGrid
        items={[
          { label: copy.labels.currentStatus, value: <StatusChip status={adoptionCase.status} /> },
          { label: copy.labels.created, value: formatDate(adoptionCase.createdAt) },
          { label: copy.labels.closed, value: formatDate(adoptionCase.closedAt) },
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
            value: formatHkdCents(adoptionCase.successfulAdoption?.adoptionFeeCents),
          },
        ]}
      />
    </Section>
  );
}

export function CaseDetail({ caseId }: CaseDetailProps) {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = CASE_DETAIL_COPY[language];
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
          className="inline-flex items-center gap-2 py-2 text-sm font-medium text-[var(--color-primary)] hover:underline"
        >
          <ArrowLeft className="h-4 w-4" />
          {copy.backToCases}
        </Link>
        <section className={sectionClassName()}>
          <div className="p-4 text-[var(--color-error)]" role="alert">
            {caseError?.message ?? copy.notFound}
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
              {formatDate(adoptionCase.createdAt)}
            </p>
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => refetch()} disabled={caseFetching}>
          <RefreshCw className="h-4 w-4" />
          {copy.refresh}
        </Button>
      </div>

      {statusesError && <CaseDetailStatusesError message={statusesError.message} />}

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
            { label: copy.labels.submitted, value: formatDate(adoptionCase.createdAt) },
            { label: copy.labels.closed, value: formatDate(adoptionCase.closedAt) },
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
        <RecordSummary
          title={copy.labels.assessment}
          record={adoptionCase.assessment}
          language={language}
        />
        <RecordSummary
          title={copy.labels.preferences}
          record={adoptionCase.preferences}
          language={language}
        />
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
