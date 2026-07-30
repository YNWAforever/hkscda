import { fetchAdminJson } from "../../../lib/admin/http";
import { AdminApiError } from "../../../lib/admin/session";
import type {
  AdoptionGuidePublishResult,
  PaginatedAdoptionGuideReleases,
} from "../../../lib/adoptionGuideReleases/repository.server";
import type {
  AdoptionGuideReadiness,
  AdoptionGuideReadinessIssue,
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
