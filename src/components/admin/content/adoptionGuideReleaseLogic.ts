import { fetchAdminJson } from "../../../lib/admin/http";
import type { AdminLanguage } from "../../../lib/admin/language";
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
import { documentErrorMessage } from "./documentErrors";

export type ReleaseFilters = {
  q?: string;
  species?: AdoptionGuideSpecies | "all";
  state?: AdoptionGuideReleaseState | "all";
  page?: number;
  pageSize?: number;
};

/** The five steps of the editor. The name of each is in `adoptionGuideCopy`, by its id. */
export const ADOPTION_GUIDE_EDITOR_STEPS = [
  { id: "topic" },
  { id: "chinese_pdf" },
  { id: "english_pdf" },
  { id: "knowledge" },
  { id: "preview" },
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

/**
 * Why a save, submit, withdraw, return or publish failed. The text is written when the screen
 * renders (see `adoptionGuideFailureText`), so it follows the admin's language. `cause` is the
 * error the server or the browser gave, kept only when it has a message to show.
 */
export type AdoptionGuideMutationError<T> =
  | {
      kind: "conflict";
      preservedDraft: T;
    }
  | {
      kind: "error";
      cause?: unknown;
    };

export type AdoptionGuideErrorCode = "conflict" | "save_failed";

/**
 * An error as the screen keeps it: a code for the text to show when there is no better one, and the
 * `cause` (the caught error) whose own message is shown first. The text of the codes is in
 * `adoptionGuideCopy.errors`.
 */
export type AdoptionGuideFailure = { code?: AdoptionGuideErrorCode; cause?: unknown };

/** The failure to keep for a resolved mutation error. */
export function adoptionGuideFailureOf<T>(
  resolved: AdoptionGuideMutationError<T>,
): AdoptionGuideFailure {
  return resolved.kind === "conflict"
    ? { code: "conflict" }
    : { code: "save_failed", cause: resolved.cause };
}

/**
 * The message for a failure in `language`, or `undefined` when there is nothing to show. A cause
 * with a message shows that message (a session error is translated); otherwise the code's text,
 * taken from `errors`, which is `adoptionGuideCopy.errors` for the language.
 */
export function adoptionGuideFailureText(
  failure: AdoptionGuideFailure | undefined,
  errors: Record<AdoptionGuideErrorCode, string>,
  language: AdminLanguage,
): string | undefined {
  if (!failure) return undefined;
  const fromCause = documentErrorMessage(failure.cause, language);
  if (fromCause !== null) return fromCause;
  return failure.code ? errors[failure.code] : undefined;
}

export function buildAdoptionGuideReleaseSearchParams(input: ReleaseFilters = {}) {
  const params = new URLSearchParams();
  const query = input.q?.trim().slice(0, 200);

  if (query) params.set("q", query);
  if (input.species && input.species !== "all") params.set("species", input.species);
  if (input.state && input.state !== "all") params.set("state", input.state);
  params.set("page", String(boundInteger(input.page ?? 1, 1, Number.MAX_SAFE_INTEGER)));
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

  if (isConflict) return { kind: "conflict", preservedDraft: localDraft };

  return { kind: "error", cause: error instanceof Error && error.message ? error : undefined };
}

export async function fetchAdoptionGuideReleases(
  filters: ReleaseFilters = {},
  request: AdminJsonRequest = fetchAdminJson,
) {
  return request<PaginatedAdoptionGuideReleases>(
    `/api/admin/adoption-guide-releases?${buildAdoptionGuideReleaseSearchParams(filters)}`,
  );
}
export type AdoptionGuideReleaseOwnership = {
  ownerReleaseIdsByAssetId: Record<string, string>;
  ownerReleaseIdsByKnowledgePostId: Record<string, string>;
};

export function buildAdoptionGuideReleaseOwnership(releases: AdoptionGuideRelease[]) {
  const ownership: AdoptionGuideReleaseOwnership = {
    ownerReleaseIdsByAssetId: {},
    ownerReleaseIdsByKnowledgePostId: {},
  };

  for (const release of releases) {
    for (const assetId of [release.zhHkAssetId, release.enAssetId]) {
      if (assetId && !ownership.ownerReleaseIdsByAssetId[assetId]) {
        ownership.ownerReleaseIdsByAssetId[assetId] = release.id;
      }
    }
    if (
      release.knowledgePostId &&
      !ownership.ownerReleaseIdsByKnowledgePostId[release.knowledgePostId]
    ) {
      ownership.ownerReleaseIdsByKnowledgePostId[release.knowledgePostId] = release.id;
    }
  }

  return ownership;
}

export async function fetchAdoptionGuideReleaseOwnership(
  request: AdminJsonRequest = fetchAdminJson,
) {
  const releases: AdoptionGuideRelease[] = [];
  let page = 1;
  let total = Number.POSITIVE_INFINITY;

  while (releases.length < total) {
    const response = await fetchAdoptionGuideReleases({ page, pageSize: 50 }, request);
    releases.push(...response.items);
    total = response.total;
    if (response.items.length === 0 || response.page * response.pageSize >= total) break;
    page += 1;
  }

  return buildAdoptionGuideReleaseOwnership(releases);
}

export function resolveLinkedAdoptionGuideRelease(
  releases: AdoptionGuideRelease[],
  selectedId: string | null,
  linkedRelease?: AdoptionGuideRelease | null,
) {
  return (
    releases.find((release) => release.id === selectedId) ??
    (linkedRelease?.id === selectedId ? linkedRelease : null) ??
    releases[0] ??
    null
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

/** Why the release cannot be submitted or published yet. The text is in `adoptionGuideCopy.blockers`. */
export type AdoptionGuideBlocker = "unsaved_changes" | "stale_preview" | "not_ready";

export type AdoptionGuideReleaseWorkflowState = {
  dirty: boolean;
  previewFresh: boolean;
  ready: boolean;
  canSubmit: boolean;
  canPublish: boolean;
  blocker: AdoptionGuideBlocker | null;
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
  const blocker = blockerOf({ dirty, previewFresh, ready });

  return {
    dirty,
    previewFresh,
    ready,
    canSubmit: input.release.state === "draft" && !dirty && ready,
    canPublish: input.release.state === "in_review" && !dirty && ready,
    blocker,
  };
}

function blockerOf({
  dirty,
  previewFresh,
  ready,
}: {
  dirty: boolean;
  previewFresh: boolean;
  ready: boolean;
}): AdoptionGuideBlocker | null {
  if (dirty) return "unsaved_changes";
  if (!previewFresh) return "stale_preview";
  if (!ready) return "not_ready";
  return null;
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
    // admin-copy-exempt: the stored title of the uploaded document, not interface text
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

export type AdoptionGuideReleaseRuntimeQueryClient = {
  invalidateQueries: (input: { queryKey: readonly string[] }) => Promise<unknown>;
  refetchQueries: (input: { queryKey: readonly string[] }) => Promise<unknown>;
};

export function createAdoptionGuideReleaseRuntimeController({
  queryClient,
  setLocalError,
  createIdempotencyKey = () => crypto.randomUUID(),
}: {
  queryClient: AdoptionGuideReleaseRuntimeQueryClient;
  setLocalError: (failure: AdoptionGuideFailure | undefined) => void;
  createIdempotencyKey?: () => string;
}) {
  let publishAttempt: {
    releaseId: string;
    version: number;
    payload: AdoptionGuidePublishInput;
  } | null = null;

  return {
    getPublishPayload(release: Pick<AdoptionGuideRelease, "id" | "version">) {
      publishAttempt = getAdoptionGuidePublishAttempt(
        publishAttempt,
        release.id,
        release.version,
        (payload) => createAdoptionGuidePublishAttempt(payload, createIdempotencyKey),
      );
      return publishAttempt.payload;
    },
    onActionError<T>(error: unknown, localDraft: T) {
      const resolved = resolveMutationError(error, localDraft);
      setLocalError(adoptionGuideFailureOf(resolved));
      return resolved;
    },
    async onActionSuccess({
      operation,
      releaseId,
    }: {
      operation: AdoptionGuideReleaseMutationOperation;
      releaseId: string;
    }) {
      setLocalError(undefined);
      const previewQueryKey = ["adoption-guide-releases", releaseId, "preview"] as const;
      if (operation === "publish") {
        publishAttempt = null;
        await invalidateAdoptionGuidePublishQueries(queryClient);
      } else {
        await queryClient.invalidateQueries({ queryKey: ["adoption-guide-releases"] });
      }
      await queryClient.invalidateQueries({ queryKey: previewQueryKey });
      if (operation === "save") {
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ["adoption-guide-releases"] }),
          queryClient.refetchQueries({ queryKey: previewQueryKey }),
        ]);
      }
    },
    async upload<T>({
      release,
      language,
      file,
      id,
      uploadPdf,
    }: {
      release: Pick<AdoptionGuideRelease, "topic" | "species" | "sortOrder">;
      language: "zh-HK" | "en";
      file: File;
      id: string;
      uploadPdf: (input: {
        file: File;
        objectPath: string;
        metadata: Omit<ReturnType<typeof buildAdoptionGuideUploadMetadata>, "objectPathPrefix">;
      }) => Promise<T>;
    }) {
      const { objectPathPrefix, ...metadata } = buildAdoptionGuideUploadMetadata(release, language);
      const result = await uploadPdf({
        file,
        objectPath: `${objectPathPrefix}/${id}.pdf`,
        metadata,
      });
      return { metadata, result };
    },
  };
}
