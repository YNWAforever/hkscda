import type { ContentDetail } from "./types";

export type ContentLifecycleErrorCode = "conflict" | "not_found" | "invalid" | "internal";

const lifecycleStatuses: Record<ContentLifecycleErrorCode, number> = {
  conflict: 409,
  not_found: 404,
  invalid: 422,
  internal: 500,
};

export class ContentLifecycleError extends Error {
  name = "ContentLifecycleError";
  readonly status: number;

  constructor(
    public readonly code: ContentLifecycleErrorCode,
    message = "Content lifecycle operation failed",
  ) {
    super(message);
    this.status = lifecycleStatuses[code];
  }
}

export type ContentPublicSnapshot = ContentDetail;

export type ContentRevisionSummary = {
  id: string;
  contentId: string;
  version: number;
  operation: string;
  createdBy: string;
  createdAt: string;
  isPublished: boolean;
};

export type ContentLifecycleResult = {
  contentId: string;
  version: number;
  revisionId: string;
  childId?: string;
};

export type ContentLifecycleMutationOperation =
  | "archive"
  | "save_content"
  | "upsert_profile"
  | "create_update"
  | "create_media"
  | "create_link";

export type ContentLifecycleMutation = {
  actorUserId: string;
  contentId: string;
  expectedVersion: number;
  operation: ContentLifecycleMutationOperation;
  values: Record<string, unknown>;
};

export function buildPublicContentSnapshot(detail: ContentDetail): ContentPublicSnapshot {
  const updates = detail.updates
    .filter((update) => update.visibility === "public")
    .map((update) => ({
      ...update,
      media: update.media.filter((media) => media.storyUpdateId === update.id),
    }));
  const publicUpdateIds = new Set(updates.map((update) => update.id));
  const media = detail.media.filter(
    (item) => item.storyUpdateId === null || publicUpdateIds.has(item.storyUpdateId),
  );

  return {
    ...detail,
    status: "published",
    coverMediaId: media.some((item) => item.id === detail.coverMediaId)
      ? detail.coverMediaId
      : null,
    coverImageUrl: media.some((item) => item.id === detail.coverMediaId)
      ? detail.coverImageUrl
      : null,
    storyProfile: detail.storyProfile
      ? { ...detail.storyProfile, internalAddress: null, internalLocationNotes: null }
      : null,
    links: [],
    media,
    updates,
    latestPublicUpdate:
      updates.slice().sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null,
    socialCopies: [],
    notificationDrafts: [],
  };
}
