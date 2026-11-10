import type { createContentMediaLifecycle } from "./mediaLifecycle.server";
import type { createContentLifecycleService } from "./lifecycle.service";
import { z } from "zod";
import {
  buildAdopterNotificationDrafts,
  type AdopterNotificationRecipient,
} from "./notificationDrafts";
import { validatePublishableContent } from "./rules";
import {
  adminContentSearchSchema,
  CONTENT_MEDIA_BUCKET,
  contentLinkInputSchema,
  contentMediaInputSchema,
  contentMediaUploadTargetSchema,
  contentInputSchema,
  contentUpdateSchema,
  linkSearchSchema,
  notificationDraftStatusSchema,
  publicContentSearchSchema,
  socialCopyGenerateSchema,
  socialCopyStatusSchema,
  socialCopyUpdateSchema,
  storyProfileInputSchema,
  storyUpdateInputSchema,
  type LinkSearch,
  type SocialCopyUpdateInput,
} from "./schemas";
import { generateSocialCopyVariants } from "./socialCopy";
import type {
  ContentDetail,
  ContentSummary,
  PublicStoryMapPoint,
  RecipientNotificationDraft,
  SocialCopyVariant,
  StoryUpdate,
} from "./types";

type AdminContentSearch = z.infer<typeof adminContentSearchSchema>;
type PublicContentSearch = z.infer<typeof publicContentSearchSchema>;
type ContentInput = z.infer<typeof contentInputSchema>;
type StoryProfileInput = z.infer<typeof storyProfileInputSchema>;
type StoryUpdateInput = z.infer<typeof storyUpdateInputSchema>;
type ContentMediaInput = z.infer<typeof contentMediaInputSchema>;
type ContentLinkInput = z.infer<typeof contentLinkInputSchema>;
type SocialCopyStatusInput = z.infer<typeof socialCopyStatusSchema>;
type NotificationDraftStatusInput = z.infer<typeof notificationDraftStatusSchema>;

export class ContentValidationError extends Error {
  name = "ContentValidationError";

  constructor(public issues: Array<{ field: string; message: string }>) {
    super("Content validation failed");
  }
}

/**
 * Social copy and adopter notification drafts point people at the public story page, so they are
 * built from what that page shows: the published slug and the published revision's wording. While
 * the public page serves nothing for the item (never published, archived, not yet effective),
 * there is nothing to link to, and the request is refused as a 409 with this code.
 */
export class ContentNotPublishedError extends Error {
  name = "ContentNotPublishedError";
  readonly code = "not_published";
  readonly status = 409;

  constructor() {
    super("Publish the story before generating outbound copy");
  }
}

/**
 * Social copy for one story update is quoted from the published snapshot, so an update the
 * published revision does not contain (added or changed since it was published) has nothing on
 * the linked page to quote, and the request is refused as a 409 with this code (CMS-02).
 */
export class ContentUpdateNotPublishedError extends Error {
  name = "ContentUpdateNotPublishedError";
  readonly code = "update_not_published";
  readonly status = 409;

  constructor() {
    super("Publish the story update before generating outbound copy");
  }
}

export type ContentAuditLogInsert = {
  actor_user_id: string | null;
  action: string;
  entity:
    | "content_item"
    | "content_link"
    | "rescue_story_profile"
    | "story_update"
    | "content_media"
    | "social_copy_variant"
    | "recipient_notification_draft";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp?: string;
};

export type ContentRepository = {
  listPublicContent(
    input: PublicContentSearch | z.infer<typeof publicContentSearchSchema>,
  ): Promise<{ items: ContentSummary[]; total: number }>;
  listPublicStoriesPage(input: PublicContentSearch): Promise<{
    items: ContentSummary[];
    total: number;
    points: PublicStoryMapPoint[];
  }>;
  getPublicContentBySlug(slug: string): Promise<ContentDetail | null>;
  listPublicMapStories(input: PublicContentSearch): Promise<PublicStoryMapPoint[]>;
  listAdminContent(input: AdminContentSearch): Promise<{ items: ContentSummary[]; total: number }>;
  getAdminUpdateBody?(contentId: string, updateId: string): Promise<string | null>;
  getAdminContent(id: string, historyPage?: number): Promise<ContentDetail | null>;
  createContent(input: ContentInput): Promise<string>;
  updateContent(id: string, input: Partial<ContentInput>): Promise<ContentDetail>;
  upsertStoryProfile(contentId: string, input: StoryProfileInput): Promise<ContentDetail>;
  createStoryUpdate(contentId: string, input: StoryUpdateInput): Promise<string>;
  createContentMedia(contentId: string, input: ContentMediaInput): Promise<string>;
  createSignedUploadUrl(objectPath: string): Promise<{ token: string; path: string }>;
  createContentLink(contentId: string, input: ContentLinkInput): Promise<string>;
  searchLinks(
    input: LinkSearch,
  ): Promise<Array<{ id: string; label: string; sublabel: string | null }>>;
  publishContent(id: string): Promise<ContentDetail>;
  archiveContent(id: string): Promise<ContentDetail>;
  insertSocialCopies(
    rows: Array<Omit<SocialCopyVariant, "id" | "createdAt" | "updatedAt">>,
  ): Promise<void>;
  getStoryUpdate(id: string): Promise<StoryUpdate | null>;
  listNotificationDraftKeys(
    storyUpdateId: string,
  ): Promise<Array<{ channel: string; recipientContact: string }>>;
  resolveAdopterRecipients(contentId: string): Promise<AdopterNotificationRecipient[]>;
  insertNotificationDrafts(
    rows: Array<Omit<RecipientNotificationDraft, "id" | "createdAt" | "updatedAt">>,
  ): Promise<void>;
  updateNotificationDraftStatus(
    id: string,
    status: RecipientNotificationDraft["status"],
  ): Promise<void>;
  updateSocialCopy(id: string, patch: SocialCopyUpdateInput): Promise<void>;
  updateSocialCopyStatus(id: string, status: SocialCopyVariant["status"]): Promise<void>;
  insertAuditLog(row: ContentAuditLogInsert): Promise<void>;
  generateSocialCopiesWithAudit?(
    rows: Array<Omit<SocialCopyVariant, "id" | "createdAt" | "updatedAt">>,
    actorUserId: string | null,
    contentId: string,
    storyUpdateId: string | null,
    platform: string | null,
  ): Promise<number>;
  generateNotificationDraftsWithAudit?(
    rows: Array<Omit<RecipientNotificationDraft, "id" | "createdAt" | "updatedAt">>,
    actorUserId: string | null,
    storyUpdateId: string,
  ): Promise<number>;
  updateSocialCopyStatusWithAudit?(
    id: string,
    status: SocialCopyVariant["status"],
    actorUserId: string | null,
  ): Promise<void>;
  updateSocialCopyWithAudit?(
    id: string,
    patch: SocialCopyUpdateInput,
    actorUserId: string | null,
  ): Promise<void>;
  updateNotificationDraftStatusWithAudit?(
    id: string,
    status: RecipientNotificationDraft["status"],
    actorUserId: string | null,
  ): Promise<void>;
};

type CreateContentServiceOptions = {
  mediaLifecycle?: ReturnType<typeof createContentMediaLifecycle>;
  lifecycle?: ReturnType<typeof createContentLifecycleService>;
  repo: ContentRepository;
  now?: () => Date;
  publicBaseUrl: string;
};

type ActorInput = {
  actorUserId: string | null;
};

type CreateContentArgs = ActorInput & {
  input: unknown;
};

type UpdateContentArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type ContentActionArgs = ActorInput & {
  contentId: string;
  input?: unknown;
};

type UpsertStoryProfileArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type CreateStoryUpdateArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type CreateContentMediaArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type CreateUploadTargetArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type CreateContentLinkArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type GenerateSocialCopyArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type UpdateSocialCopyArgs = ActorInput & {
  copyId: string;
  input: unknown;
};

type UpdateSocialCopyStatusArgs = ActorInput & {
  copyId: string;
  input: unknown;
};

type GenerateNotificationDraftsArgs = ActorInput & {
  storyUpdateId: string;
};

type UpdateNotificationDraftStatusArgs = ActorInput & {
  draftId: string;
  input: unknown;
};

function publicStoryUrl(publicBaseUrl: string, slug: string) {
  return `${publicBaseUrl.replace(/\/+$/, "")}/stories/${encodeURIComponent(slug)}`;
}

function timestamp(now: () => Date) {
  return now().toISOString();
}

function assertPublicOutboundStoryUpdate(storyUpdate: StoryUpdate) {
  if (storyUpdate.visibility !== "public") {
    throw new Error("Internal story updates cannot generate outbound content");
  }
}

async function assertPublicMediaTarget(
  repo: ContentRepository,
  contentId: string,
  storyUpdateId: string | null,
) {
  if (!storyUpdateId) return;

  const storyUpdate = await repo.getStoryUpdate(storyUpdateId);
  if (!storyUpdate) throw new Error("Story update not found");
  if (storyUpdate.contentItemId !== contentId) {
    throw new Error("Story update does not belong to this content item");
  }
  if (storyUpdate.visibility === "internal") {
    throw new Error("Internal story updates cannot use public content media");
  }
}

export function createContentService({
  repo,
  lifecycle,
  mediaLifecycle,
  now = () => new Date(),
  publicBaseUrl,
}: CreateContentServiceOptions) {
  async function audit(row: Omit<ContentAuditLogInsert, "timestamp">) {
    await repo.insertAuditLog({ ...row, timestamp: timestamp(now) });
  }

  /**
   * The story as its public page shows it. `content` is the authoring row: its slug and wording
   * may be an unpublished, unreviewed edit (BUG-66). The public page answers on
   * `content_item.published_slug` with the published revision's snapshot, so outbound copy is built
   * from that same read; when it serves nothing for this item, there is nothing to link to.
   */
  async function publishedStory(content: ContentDetail): Promise<ContentDetail> {
    if (!content.publishedSlug) throw new ContentNotPublishedError();
    const published = await repo.getPublicContentBySlug(content.publishedSlug);
    if (!published || published.id !== content.id || published.status !== "published") {
      throw new ContentNotPublishedError();
    }
    return published;
  }

  async function draftAdopterNotifications(actorUserId: string | null, update: StoryUpdate) {
    assertPublicOutboundStoryUpdate(update);
    const content = await repo.getAdminContent(update.contentItemId);
    if (!content) throw new Error("Content item not found");

    const recipients = await repo.resolveAdopterRecipients(content.id);
    // With nobody to write to there is no link to get wrong, so only a real draft needs the
    // published story; an unpublished story with adopters is refused.
    const story = recipients.length > 0 ? await publishedStory(content) : null;

    // buildAdopterNotificationDrafts dedupes within one call, but knows
    // nothing about earlier ones. Without this filter a second press of the
    // generate button re-drafts every adopter, and the operator sends the
    // same message to a real person twice. Status is deliberately ignored:
    // a dismissed draft was a decision, and a sent one must never be
    // regenerated.
    //
    // Read every draft key for this update from the repository rather than
    // content.notificationDrafts, which getAdminContent slices to 20 rows: an
    // update with more drafts could hide a match and duplicate a real send.
    const existingDrafts = await repo.listNotificationDraftKeys(update.id);
    const alreadyDrafted = new Set(
      existingDrafts.map((draft) => `${draft.channel}:${draft.recipientContact}`),
    );

    const drafts = story
      ? buildAdopterNotificationDrafts({
          contentItemId: content.id,
          storyUpdateId: update.id,
          storyTitle: story.title,
          updateTitle: update.title,
          updateBody: update.body,
          publicUrl: publicStoryUrl(publicBaseUrl, story.slug),
          recipients,
        }).filter((draft) => !alreadyDrafted.has(`${draft.channel}:${draft.recipientContact}`))
      : [];

    if (repo.generateNotificationDraftsWithAudit) {
      return repo.generateNotificationDraftsWithAudit(drafts, actorUserId, update.id);
    }

    await repo.insertNotificationDrafts(drafts);
    // Drafting messages addressed to adopters reaches recipient PII, so the
    // count is the part that matters to a later reviewer — not the bodies.
    await audit({
      actor_user_id: actorUserId,
      action: "content.notification_draft.generate",
      entity: "recipient_notification_draft",
      entity_id: update.id,
      detail: { count: drafts.length },
    });
    return drafts.length;
  }

  return {
    async getRevision(contentId: string, revisionId: string) {
      if (!lifecycle) throw new Error("Content lifecycle is unavailable");
      return lifecycle.getRevision(contentId, revisionId);
    },
    async listRevisions(contentId: string, beforeVersion?: number) {
      if (!lifecycle) throw new Error("Content lifecycle is unavailable");
      return lifecycle.listRevisions(contentId, beforeVersion);
    },
    async restoreRevision({ actorUserId, contentId, input }: UpdateContentArgs) {
      if (!lifecycle) throw new Error("Content lifecycle is unavailable");
      return lifecycle.restore({ actorUserId, contentId, input });
    },
    async listPublicContent(raw: unknown) {
      return repo.listPublicContent(publicContentSearchSchema.parse(raw));
    },

    async listPublicStoriesPage(raw: unknown) {
      return repo.listPublicStoriesPage(publicContentSearchSchema.parse(raw));
    },
    async getPublicContentBySlug(slug: string) {
      const content = await repo.getPublicContentBySlug(slug);
      return content?.status === "published" ? content : null;
    },

    async listPublicMapStories(raw: unknown) {
      return repo.listPublicMapStories(publicContentSearchSchema.parse(raw));
    },

    async listAdminContent(raw: unknown) {
      return repo.listAdminContent(adminContentSearchSchema.parse(raw));
    },

    async getAdminUpdateBody(contentId: string, updateId: string) {
      if (!repo.getAdminUpdateBody) throw new Error("Content history unavailable");
      return repo.getAdminUpdateBody(contentId, updateId);
    },
    async getAdminContent(id: string, historyPage = 1) {
      return repo.getAdminContent(id, historyPage);
    },

    async createContent({ actorUserId, input }: CreateContentArgs) {
      const parsed = contentInputSchema.parse(input);
      if (parsed.status !== "draft") {
        throw new Error("Content items must be created as drafts");
      }
      if (lifecycle) {
        const result = await lifecycle.create({ actorUserId, input });
        return { id: result.contentId, ...result };
      }
      const id = await repo.createContent(parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "content.create",
        entity: "content_item",
        entity_id: id,
        detail: { type: parsed.type, title: parsed.title, status: parsed.status },
      });

      return { id };
    },

    async updateContent({ actorUserId, contentId, input }: UpdateContentArgs) {
      if (lifecycle) {
        const result = await lifecycle.save({ actorUserId, contentId, input });
        const content = await repo.getAdminContent(contentId);
        if (!content) throw new Error("Content item not found");
        return { ...content, version: result.version, revisionId: result.revisionId };
      }
      const parsed = contentUpdateSchema.parse(input);
      const current = await repo.getAdminContent(contentId);
      if (!current) throw new Error("Content item not found");

      const candidate: ContentDetail = { ...current, ...parsed };
      if (candidate.status === "published") {
        const issues = validatePublishableContent(candidate);
        if (issues.length > 0) throw new ContentValidationError(issues);
      }

      // The validator no longer requires publishedAt (the publish RPC sets it),
      // but the DB CHECK still enforces `status <> 'published' or published_at
      // is not null`. Backfill it here for a direct update that flips the
      // status, mirroring publishContent's legacy fallback, so the write does
      // not surface as a generic 500.
      const payload: Partial<ContentInput> = { ...parsed };
      if (candidate.status === "published" && !candidate.publishedAt) {
        payload.publishedAt = timestamp(now);
      }

      const content = await repo.updateContent(contentId, payload);
      await audit({
        actor_user_id: actorUserId,
        action: "content.update",
        entity: "content_item",
        entity_id: contentId,
        detail: parsed,
      });
      if (current.status !== "published" && content.status === "published") {
        await audit({
          actor_user_id: actorUserId,
          action: "content.publish",
          entity: "content_item",
          entity_id: contentId,
          detail: { slug: content.slug },
        });
      }

      return content;
    },

    async upsertStoryProfile({ actorUserId, contentId, input }: UpsertStoryProfileArgs) {
      if (lifecycle) {
        const result = await lifecycle.profile({ actorUserId, contentId, input });
        const content = await repo.getAdminContent(contentId);
        if (!content) throw new Error("Content item not found");
        return { ...content, version: result.version, revisionId: result.revisionId };
      }
      const parsed = storyProfileInputSchema.parse(input);
      const content = await repo.upsertStoryProfile(contentId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "content.story_profile.upsert",
        entity: "rescue_story_profile",
        entity_id: contentId,
        detail: {
          animalType: parsed.animalType,
          publicStatus: parsed.publicStatus,
          rescueRegion: parsed.rescueRegion,
          showOnMap: parsed.showOnMap,
        },
      });

      return content;
    },

    async createStoryUpdate({ actorUserId, contentId, input }: CreateStoryUpdateArgs) {
      const parsed = storyUpdateInputSchema.parse(input);
      let id: string;

      if (lifecycle) {
        const result = await lifecycle.update({ actorUserId, contentId, input });
        if (!result.childId) throw new Error("Content lifecycle did not return a child id");
        id = result.childId;
      } else {
        id = await repo.createStoryUpdate(contentId, parsed);
        await audit({
          actor_user_id: actorUserId,
          action: "content.story_update.create",
          entity: "story_update",
          entity_id: id,
          detail: {
            contentId,
            kind: parsed.kind,
            visibility: parsed.visibility,
            shouldGenerateAdopterDrafts: parsed.shouldGenerateAdopterDrafts,
          },
        });
      }

      const notificationDrafts = { created: 0, warning: null as string | null };
      if (parsed.shouldGenerateAdopterDrafts) {
        if (parsed.visibility !== "public") {
          notificationDrafts.warning = "內部更新不會建立通知草稿。";
        } else {
          try {
            const update = await repo.getStoryUpdate(id);
            if (!update) throw new Error("Story update not found");
            notificationDrafts.created = await draftAdopterNotifications(actorUserId, update);
            if (notificationDrafts.created === 0) {
              notificationDrafts.warning = "沒有可聯絡的領養者，已略過通知草稿。";
            }
          } catch (error) {
            if (error instanceof ContentNotPublishedError) {
              notificationDrafts.warning = "故事尚未發布，未有建立通知草稿，更新已儲存。";
            } else {
              console.error(error);
              notificationDrafts.warning = "通知草稿建立失敗，更新已儲存。";
            }
          }
        }
      }

      return { id, notificationDrafts };
    },

    async createContentMedia({ actorUserId, contentId, input }: CreateContentMediaArgs) {
      if (mediaLifecycle) {
        const result = await mediaLifecycle.finalize({ actorUserId, contentId, input });
        if (!result.childId) throw new Error("Media finalization did not return a media id");
        return { id: result.childId, ...result };
      }
      if (lifecycle) {
        const parsed = contentMediaInputSchema.parse(input);
        await assertPublicMediaTarget(repo, contentId, parsed.storyUpdateId);
        const result = await lifecycle.media({ actorUserId, contentId, input });
        if (!result.childId) throw new Error("Content lifecycle did not return a child id");
        return { id: result.childId, ...result };
      }
      const parsed = contentMediaInputSchema.parse(input);
      await assertPublicMediaTarget(repo, contentId, parsed.storyUpdateId);
      const id = await repo.createContentMedia(contentId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "content.media.create",
        entity: "content_media",
        entity_id: id,
        detail: {
          contentId,
          storyUpdateId: parsed.storyUpdateId,
          storageBucket: CONTENT_MEDIA_BUCKET,
          storagePath: parsed.storagePath,
          isCover: parsed.isCover,
        },
      });

      return { id };
    },

    async previewMedia({ actorUserId, contentId, input }: CreateContentMediaArgs) {
      if (!mediaLifecycle) throw new Error("Private media is unavailable");
      return mediaLifecycle.preview({ actorUserId, contentId, input });
    },
    async createUploadTarget({ actorUserId, contentId, input }: CreateUploadTargetArgs) {
      if (mediaLifecycle) return mediaLifecycle.allocate({ actorUserId, contentId, input });
      const parsed = contentMediaUploadTargetSchema.parse(input);
      if (!parsed.objectPath.startsWith(`${contentId}/`)) {
        throw new Error("Upload path does not belong to this content item");
      }
      await assertPublicMediaTarget(repo, contentId, parsed.storyUpdateId);
      return repo.createSignedUploadUrl(parsed.objectPath);
    },

    async createContentLink({ actorUserId, contentId, input }: CreateContentLinkArgs) {
      if (lifecycle) {
        const result = await lifecycle.link({ actorUserId, contentId, input });
        if (!result.childId) throw new Error("Content lifecycle did not return a child id");
        return { id: result.childId, ...result };
      }
      const parsed = contentLinkInputSchema.parse(input);
      const id = await repo.createContentLink(contentId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "content.link.create",
        entity: "content_link",
        entity_id: id,
        detail: { contentId, ...parsed },
      });

      return { id };
    },

    async searchLinks(raw: unknown) {
      const parsed = linkSearchSchema.parse(raw);
      return repo.searchLinks(parsed);
    },

    async publishContent({ actorUserId, contentId, input }: ContentActionArgs) {
      const draft = await repo.getAdminContent(contentId);
      if (!draft) throw new Error("Content item not found");

      const issues = validatePublishableContent(draft);
      if (issues.length > 0) throw new ContentValidationError(issues);

      if (mediaLifecycle) {
        const result = await mediaLifecycle.publish({ actorUserId, contentId, input });
        const content = await repo.getAdminContent(contentId);
        if (!content) throw new Error("Content item not found");
        return {
          ...content,
          version: result.version,
          revisionId: result.revisionId,
          mediaPending: result.mediaPending,
        };
      }
      if (lifecycle) {
        const result = await lifecycle.publish({ actorUserId, contentId, input });
        const content = await repo.getAdminContent(contentId);
        if (!content) throw new Error("Content item not found");
        return { ...content, version: result.version, revisionId: result.revisionId };
      }

      if (!draft.publishedAt) {
        await repo.updateContent(contentId, { publishedAt: timestamp(now) });
      }

      const published = await repo.publishContent(contentId);
      await audit({
        actor_user_id: actorUserId,
        action: "content.publish",
        entity: "content_item",
        entity_id: contentId,
        detail: { slug: published.slug },
      });

      return published;
    },

    async archiveContent({ actorUserId, contentId, input }: ContentActionArgs) {
      if (lifecycle) {
        const result = await lifecycle.archive({ actorUserId, contentId, input });
        const content = await repo.getAdminContent(contentId);
        if (!content) throw new Error("Content item not found");
        return { ...content, version: result.version, revisionId: result.revisionId };
      }
      const archived = await repo.archiveContent(contentId);
      await audit({
        actor_user_id: actorUserId,
        action: "content.archive",
        entity: "content_item",
        entity_id: contentId,
        detail: { slug: archived.slug },
      });

      return archived;
    },

    async generateSocialCopy({ actorUserId, contentId, input }: GenerateSocialCopyArgs) {
      const parsed = socialCopyGenerateSchema.parse(input);
      const content = await repo.getAdminContent(contentId);
      if (!content) throw new Error("Content item not found");

      // The authoring read validates the id the admin sent: it owns the update and says whether
      // the update is public at all. Its title and body are never copied into the outbound text.
      if (parsed.storyUpdateId) {
        const authored = await repo.getStoryUpdate(parsed.storyUpdateId);
        if (!authored) throw new Error("Story update not found");
        if (authored.contentItemId !== content.id) {
          throw new Error("Story update does not belong to this content item");
        }
        assertPublicOutboundStoryUpdate(authored);
      }

      // The link and the story's wording come from the published story, not the draft row.
      const story = await publishedStory(content);
      // The update is quoted from the published revision's snapshot: a newer unpublished edit to
      // the same update is not on the page the copy links to, so it must not be announced
      // (BUG-66's class, closed for the update text by CMS-02).
      const storyUpdate = parsed.storyUpdateId
        ? (story.updates.find((update) => update.id === parsed.storyUpdateId) ?? null)
        : null;
      if (parsed.storyUpdateId && !storyUpdate) throw new ContentUpdateNotPublishedError();
      if (storyUpdate) assertPublicOutboundStoryUpdate(storyUpdate);

      const publicUrl = publicStoryUrl(publicBaseUrl, story.slug);
      const variants = generateSocialCopyVariants({
        content: story,
        storyUpdate,
        publicUrl,
      }).filter((variant) => !parsed.platform || variant.platform === parsed.platform);

      const rows = variants.map((variant) => ({
        contentItemId: content.id,
        storyUpdateId: storyUpdate?.id ?? null,
        platform: variant.platform,
        language: variant.language,
        copyText: variant.copyText,
        hashtags: variant.hashtags,
        status: "draft" as const,
      }));
      if (repo.generateSocialCopiesWithAudit) {
        const count = await repo.generateSocialCopiesWithAudit(
          rows,
          actorUserId,
          content.id,
          storyUpdate?.id ?? null,
          parsed.platform ?? null,
        );
        return { count };
      }

      await repo.insertSocialCopies(rows);
      await audit({
        actor_user_id: actorUserId,
        action: "content.social_copy.generate",
        entity: "social_copy_variant",
        entity_id: content.id,
        detail: {
          count: variants.length,
          storyUpdateId: storyUpdate?.id ?? null,
          platform: parsed.platform ?? null,
        },
      });

      return { count: variants.length };
    },

    async updateSocialCopy({ actorUserId, copyId, input }: UpdateSocialCopyArgs) {
      const parsed: SocialCopyUpdateInput = socialCopyUpdateSchema.parse(input);
      // The change and its audit row are written in one transaction (BUG-06). A status-only
      // change uses the existing social_status command; text and hashtags use
      // update_social_copy_with_audit. The two-call path below is only for repositories
      // without either RPC (test doubles).
      const statusOnly =
        parsed.status !== undefined &&
        parsed.copyText === undefined &&
        parsed.hashtags === undefined;
      if (statusOnly && parsed.status !== undefined && repo.updateSocialCopyStatusWithAudit) {
        await repo.updateSocialCopyStatusWithAudit(copyId, parsed.status, actorUserId);
        return { ok: true };
      }
      if (repo.updateSocialCopyWithAudit) {
        await repo.updateSocialCopyWithAudit(copyId, parsed, actorUserId);
        return { ok: true };
      }
      await repo.updateSocialCopy(copyId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "content.social_copy.update",
        entity: "social_copy_variant",
        entity_id: copyId,
        detail: parsed,
      });

      return { ok: true };
    },

    async updateSocialCopyStatus({ actorUserId, copyId, input }: UpdateSocialCopyStatusArgs) {
      const parsed: SocialCopyStatusInput = socialCopyStatusSchema.parse(input);
      if (repo.updateSocialCopyStatusWithAudit) {
        await repo.updateSocialCopyStatusWithAudit(copyId, parsed.status, actorUserId);
        return { ok: true };
      }
      await repo.updateSocialCopyStatus(copyId, parsed.status);
      await audit({
        actor_user_id: actorUserId,
        action: "content.social_copy.status",
        entity: "social_copy_variant",
        entity_id: copyId,
        detail: { status: parsed.status },
      });

      return { ok: true };
    },

    async generateNotificationDrafts({
      actorUserId,
      storyUpdateId,
    }: GenerateNotificationDraftsArgs) {
      const update = await repo.getStoryUpdate(storyUpdateId);
      if (!update) throw new Error("Story update not found");
      const count = await draftAdopterNotifications(actorUserId, update);
      return { count };
    },

    async updateNotificationDraftStatus({
      actorUserId,
      draftId,
      input,
    }: UpdateNotificationDraftStatusArgs) {
      const parsed: NotificationDraftStatusInput = notificationDraftStatusSchema.parse(input);
      if (repo.updateNotificationDraftStatusWithAudit) {
        await repo.updateNotificationDraftStatusWithAudit(draftId, parsed.status, actorUserId);
        return { ok: true };
      }
      await repo.updateNotificationDraftStatus(draftId, parsed.status);
      await audit({
        actor_user_id: actorUserId,
        action: "content.notification_draft.status",
        entity: "recipient_notification_draft",
        entity_id: draftId,
        detail: { status: parsed.status },
      });

      return { ok: true };
    },
  };
}
