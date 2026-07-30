import { fetchAdminJson } from "../../../lib/admin/http";
import { AdminApiError } from "../../../lib/admin/session";
import type {
  AdoptionGuidePublishResult,
  PaginatedAdoptionGuideReleases,
} from "../../../lib/adoptionGuideReleases/repository.server";
import type {
  AdoptionGuideReadiness,
  AdoptionGuideReadinessIssue,
  AdoptionGuidePreview,
  AdoptionGuideRelease,
  AdoptionGuideReleaseState,
  AdoptionGuideSpecies,
} from "../../../lib/adoptionGuideReleases/types";

export type ReleaseFilters = {
  q?: string;
  species?: AdoptionGuideSpecies | "all";
  state?: AdoptionGuideReleaseState | "all";
  page?: number;
  pageSize?: number;
};

export const ADOPTION_GUIDE_EDITOR_STEPS = [
  { id: "topic", label: "主題及物種" },
  { id: "chinese_pdf", label: "中文 PDF" },
  { id: "english_pdf", label: "English PDF" },
  { id: "knowledge", label: "知識庫內容" },
  { id: "preview", label: "預覽及發佈" },
] as const;

export type AdoptionGuideEditorStepId = (typeof ADOPTION_GUIDE_EDITOR_STEPS)[number]["id"];

export type AdoptionGuideReleaseMutationOperation =
  | "save"
  | "submit"
  | "withdraw"
  | "return-to-draft"
  | "publish";
export type AdminJsonRequest = <T>(path: string, init?: RequestInit) => Promise<T>;

export type AdoptionGuidePublishInput = {
  expectedVersion: number;
  idempotencyKey: string;
};

export type AdoptionGuidePublishAttempt<
  T extends Omit<AdoptionGuidePublishInput, "idempotencyKey">,
> = {
  idempotencyKey: string;
  payload: T & { idempotencyKey: string };
};

export type AdoptionGuideReadinessPresentation = {
  ready: boolean;
  issues: Array<AdoptionGuideReadinessIssue & { step: AdoptionGuideEditorStepId }>;
};

export type AdoptionGuideMutationError<T> =
  | {
      kind: "conflict";
      message: string;
      preservedDraft: T;
    }
  | {
      kind: "error";
      message: string;
    };

export function buildAdoptionGuideReleaseSearchParams(input: ReleaseFilters = {}) {
  const params = new URLSearchParams();
  const query = input.q?.trim().slice(0, 200);

  if (query) params.set("q", query);
  if (input.species && input.species !== "all") params.set("species", input.species);
  if (input.state && input.state !== "all") params.set("state", input.state);
  params.set("page", String(boundInteger(input.page ?? 1, 1, 50)));
  params.set("pageSize", String(boundInteger(input.pageSize ?? 25, 1, 50)));

  return params;
}

export function stepForReadinessField(
  field: AdoptionGuideReadinessIssue["field"],
): AdoptionGuideEditorStepId {
  switch (field) {
    case "zhHkAssetId":
      return "chinese_pdf";
    case "enAssetId":
      return "english_pdf";
    case "knowledgeTitle":
    case "knowledgeTopic":
    case "knowledgeShortIntro":
      return "knowledge";
    case "assets":
      return "preview";
  }
}

export function presentAdoptionGuideReadiness(
  readiness: AdoptionGuideReadiness,
): AdoptionGuideReadinessPresentation {
  return {
    ready: readiness.ready,
    issues: readiness.issues.map((issue) => ({
      ...issue,
      step: stepForReadinessField(issue.field),
    })),
  };
}

export function createAdoptionGuidePublishAttempt<
  T extends Omit<AdoptionGuidePublishInput, "idempotencyKey">,
>(
  payload: T,
  createIdempotencyKey: () => string = () => crypto.randomUUID(),
): AdoptionGuidePublishAttempt<T> {
  const idempotencyKey = createIdempotencyKey();
  return {
    idempotencyKey,
    payload: { ...payload, idempotencyKey },
  };
}

export function resolveMutationError<T>(
  error: unknown,
  localDraft: T,
): AdoptionGuideMutationError<T> {
  const isConflict =
    error instanceof AdminApiError
      ? error.status === 409 && error.code === "conflict"
      : hasStructuredConflict(error);

  if (isConflict) {
    return {
      kind: "conflict",
      message: "This release changed elsewhere. Reload before saving again.",
      preservedDraft: localDraft,
    };
  }

  return {
    kind: "error",
    message:
      error instanceof Error && error.message ? error.message : "Unable to save this release.",
  };
}

export async function fetchAdoptionGuideReleases(
  filters: ReleaseFilters = {},
  request: AdminJsonRequest = fetchAdminJson,
) {
  return request<PaginatedAdoptionGuideReleases>(
    `/api/admin/adoption-guide-releases?${buildAdoptionGuideReleaseSearchParams(filters)}`,
  );
}

export async function mutateAdoptionGuideRelease(
  id: string,
  operation: AdoptionGuideReleaseMutationOperation,
  payload: unknown,
  request: AdminJsonRequest = fetchAdminJson,
) {
  const releaseId = encodeURIComponent(id);
  const route =
    operation === "save"
      ? `/api/admin/adoption-guide-releases/${releaseId}`
      : `/api/admin/adoption-guide-releases/${releaseId}/${operation}`;

  return request<AdoptionGuideRelease | AdoptionGuidePublishResult>(route, {
    method: operation === "save" ? "PATCH" : "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

function boundInteger(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function hasStructuredConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { status?: unknown; error?: { code?: unknown } };
  return candidate.status === 409 && candidate.error?.code === "conflict";
}

export type AdoptionGuideReleaseDraft = Pick<
  AdoptionGuideRelease,
  | "topic"
  | "species"
  | "zhHkAssetId"
  | "enAssetId"
  | "knowledgeTitle"
  | "knowledgeTopic"
  | "knowledgeShortIntro"
  | "knowledgeSourceName"
  | "sortOrder"
>;

export type AdoptionGuideReleaseWorkflowState = {
  dirty: boolean;
  previewFresh: boolean;
  ready: boolean;
  canSubmit: boolean;
  canPublish: boolean;
  message: string | null;
};

export function evaluateAdoptionGuideReleaseWorkflow(input: {
  release: AdoptionGuideRelease;
  draft: AdoptionGuideReleaseDraft;
  preview: AdoptionGuidePreview | null;
  previewSucceeded: boolean;
}): AdoptionGuideReleaseWorkflowState {
  const dirty = isAdoptionGuideReleaseDirty(input.release, input.draft);
  const previewFresh = Boolean(
    input.previewSucceeded &&
    input.preview &&
    input.preview.release.id === input.release.id &&
    input.preview.release.version === input.release.version,
  );
  const ready = previewFresh && input.preview!.readiness.ready;
  const message = dirty
    ? "請先儲存變更，然後重新整理預覽。"
    : !previewFresh
      ? "請先重新整理預覽，確認目前版本。"
      : !ready
        ? "請先完成預覽中的準備項目。"
        : null;

  return {
    dirty,
    previewFresh,
    ready,
    canSubmit: input.release.state === "draft" && !dirty && ready,
    canPublish: input.release.state === "in_review" && !dirty && ready,
    message,
  };
}

export function isAdoptionGuideReleaseDirty(
  release: AdoptionGuideRelease,
  draft: AdoptionGuideReleaseDraft,
) {
  return (
    release.topic !== draft.topic ||
    release.species !== draft.species ||
    release.zhHkAssetId !== draft.zhHkAssetId ||
    release.enAssetId !== draft.enAssetId ||
    release.knowledgeTitle !== draft.knowledgeTitle ||
    release.knowledgeTopic !== draft.knowledgeTopic ||
    release.knowledgeShortIntro !== draft.knowledgeShortIntro ||
    release.knowledgeSourceName !== draft.knowledgeSourceName ||
    release.sortOrder !== draft.sortOrder
  );
}

export async function fetchAllAdoptionGuideAssets<T extends { kind: string; language: string }>(
  fetchPage: (
    page: number,
    pageSize: number,
  ) => Promise<{
    items: T[];
    total: number;
    page: number;
    pageSize: number;
  }>,
  pageSize = 50,
) {
  const items: T[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (items.length < total && page <= 50) {
    const response = await fetchPage(page, pageSize);
    items.push(...response.items);
    total = response.total;
    if (response.items.length === 0 || response.page * response.pageSize >= total) break;
    page += 1;
  }

  return items;
}

export function selectAdoptionGuideAssetsForLanguage<T extends { kind: string; language: string }>(
  assets: T[],
  language: "zh-HK" | "en",
) {
  return assets.filter((asset) => asset.kind === "adoption_guide" && asset.language === language);
}

export function buildAdoptionGuideUploadMetadata(
  release: Pick<AdoptionGuideRelease, "topic" | "species" | "sortOrder">,
  language: "zh-HK" | "en",
) {
  return {
    kind: "adoption_guide" as const,
    title: `${release.topic} ${language === "zh-HK" ? "中文" : "English"} PDF`,
    language,
    sortOrder: release.sortOrder,
    objectPathPrefix: `adoption-guides/${release.species}/${language}`,
  };
}

export function invalidateAdoptionGuidePublishQueries(queryClient: {
  invalidateQueries: (input: { queryKey: readonly string[] }) => Promise<unknown>;
}) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: ["adoption-guide-releases"] }),
    queryClient.invalidateQueries({ queryKey: ["documents"] }),
    queryClient.invalidateQueries({ queryKey: ["knowledge"] }),
  ]);
}
export function isAdoptionGuideReleaseContextLocked(pendingAction?: string) {
  return Boolean(pendingAction);
}
export function getAdoptionGuidePublishAttempt(
  existing: {
    releaseId: string;
    version: number;
    payload: AdoptionGuidePublishInput;
  } | null,
  releaseId: string,
  expectedVersion: number,
  createAttempt: (payload: { expectedVersion: number }) => AdoptionGuidePublishAttempt<{
    expectedVersion: number;
  }> = createAdoptionGuidePublishAttempt,
) {
  if (existing?.releaseId === releaseId && existing.version === expectedVersion) return existing;

  const attempt = createAttempt({ expectedVersion });
  return { releaseId, version: expectedVersion, payload: attempt.payload };
}
