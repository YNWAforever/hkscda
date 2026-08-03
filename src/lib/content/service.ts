import { z } from "zod";
import {
  buildAdopterNotificationDrafts,
  type AdopterNotificationRecipient,
} from "./notificationDrafts";
import { validatePublishableContent } from "./rules";
import {
  contentLinkInputSchema,
  contentMediaInputSchema,
  contentInputSchema,
  contentSearchSchema,
  notificationDraftStatusSchema,
  publicContentSearchSchema,
  socialCopyGenerateSchema,
  socialCopyStatusSchema,
  storyProfileInputSchema,
  storyUpdateInputSchema,
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

type ContentSearch = z.infer<typeof contentSearchSchema>;
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
  listAdminContent(input: ContentSearch): Promise<{ items: ContentSummary[]; total: number }>;
  getAdminContent(id: string): Promise<ContentDetail | null>;
  createContent(input: ContentInput): Promise<string>;
  updateContent(id: string, input: Partial<ContentInput>): Promise<ContentDetail>;
  upsertStoryProfile(contentId: string, input: StoryProfileInput): Promise<ContentDetail>;
  createStoryUpdate(contentId: string, input: StoryUpdateInput): Promise<string>;
  createContentMedia(contentId: string, input: ContentMediaInput): Promise<string>;
  createContentLink(contentId: string, input: ContentLinkInput): Promise<string>;
  publishContent(id: string): Promise<ContentDetail>;
  archiveContent(id: string): Promise<ContentDetail>;
  insertSocialCopies(
    rows: Array<Omit<SocialCopyVariant, "id" | "createdAt" | "updatedAt">>,
  ): Promise<void>;
  getStoryUpdate(id: string): Promise<StoryUpdate | null>;
  resolveAdopterRecipients(contentId: string): Promise<AdopterNotificationRecipient[]>;
  insertNotificationDrafts(
    rows: Array<Omit<RecipientNotificationDraft, "id" | "createdAt" | "updatedAt">>,
  ): Promise<void>;
  updateNotificationDraftStatus(
    id: string,
    status: RecipientNotificationDraft["status"],
  ): Promise<void>;
  updateSocialCopyStatus(id: string, status: SocialCopyVariant["status"]): Promise<void>;
  insertAuditLog(row: ContentAuditLogInsert): Promise<void>;
};

type CreateContentServiceOptions = {
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

type CreateContentLinkArgs = ActorInput & {
  contentId: string;
  input: unknown;
};

type GenerateSocialCopyArgs = ActorInput & {
  contentId: string;
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

export function createContentService({
  repo,
  now = () => new Date(),
  publicBaseUrl,
}: CreateContentServiceOptions) {
  async function audit(row: Omit<ContentAuditLogInsert, "timestamp">) {
    await repo.insertAuditLog({ ...row, timestamp: timestamp(now) });
  }

  return {
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
      return repo.listAdminContent(contentSearchSchema.parse(raw));
    },

    async getAdminContent(id: string) {
      return repo.getAdminContent(id);
    },

    async createContent({ actorUserId, input }: CreateContentArgs) {
      const parsed = contentInputSchema.parse(input);
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
      const parsed = contentInputSchema.partial().parse(input);
      const current = await repo.getAdminContent(contentId);
      if (!current) throw new Error("Content item not found");

      const candidate: ContentDetail = { ...current, ...parsed };
      if (candidate.status === "published") {
        const issues = validatePublishableContent(candidate);
        if (issues.length > 0) throw new ContentValidationError(issues);
      }

      const content = await repo.updateContent(contentId, parsed);
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
      const id = await repo.createStoryUpdate(contentId, parsed);
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

      return { id };
    },

    async createContentMedia({ actorUserId, contentId, input }: CreateContentMediaArgs) {
      const parsed = contentMediaInputSchema.parse(input);
      const id = await repo.createContentMedia(contentId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "content.media.create",
        entity: "content_media",
        entity_id: id,
        detail: {
          contentId,
          storyUpdateId: parsed.storyUpdateId,
          storageBucket: parsed.storageBucket,
          storagePath: parsed.storagePath,
          isCover: parsed.isCover,
        },
      });

      return { id };
    },

    async createContentLink({ actorUserId, contentId, input }: CreateContentLinkArgs) {
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

    async publishContent({ actorUserId, contentId }: ContentActionArgs) {
      const content = await repo.getAdminContent(contentId);
      if (!content) throw new Error("Content item not found");

      const issues = validatePublishableContent(content);
      if (issues.length > 0) throw new ContentValidationError(issues);

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

    async archiveContent({ actorUserId, contentId }: ContentActionArgs) {
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

      const storyUpdate = parsed.storyUpdateId
        ? await repo.getStoryUpdate(parsed.storyUpdateId)
        : null;
      if (parsed.storyUpdateId && !storyUpdate) throw new Error("Story update not found");
      if (storyUpdate && storyUpdate.contentItemId !== content.id) {
        throw new Error("Story update does not belong to this content item");
      }
      if (storyUpdate) assertPublicOutboundStoryUpdate(storyUpdate);

      const publicUrl = publicStoryUrl(publicBaseUrl, content.slug);
      const variants = generateSocialCopyVariants({ content, storyUpdate, publicUrl }).filter(
        (variant) => !parsed.platform || variant.platform === parsed.platform,
      );

      await repo.insertSocialCopies(
        variants.map((variant) => ({
          contentItemId: content.id,
          storyUpdateId: storyUpdate?.id ?? null,
          platform: variant.platform,
          language: variant.language,
          copyText: variant.copyText,
          hashtags: variant.hashtags,
          status: "draft",
        })),
      );

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

    async updateSocialCopyStatus({ actorUserId, copyId, input }: UpdateSocialCopyStatusArgs) {
      const parsed: SocialCopyStatusInput = socialCopyStatusSchema.parse(input);
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
      assertPublicOutboundStoryUpdate(update);

      const content = await repo.getAdminContent(update.contentItemId);
      if (!content) throw new Error("Content item not found");

      const recipients = await repo.resolveAdopterRecipients(content.id);
      const publicUrl = publicStoryUrl(publicBaseUrl, content.slug);
      const drafts = buildAdopterNotificationDrafts({
        contentItemId: content.id,
        storyUpdateId: update.id,
        storyTitle: content.title,
        updateTitle: update.title,
        updateBody: update.body,
        publicUrl,
        recipients,
      });

      await repo.insertNotificationDrafts(drafts);

      // Drafting messages addressed to adopters reaches recipient PII, so the
      // count is the part that matters to a later reviewer — not the bodies.
      await audit({
        actor_user_id: actorUserId,
        action: "content.notification_draft.generate",
        entity: "recipient_notification_draft",
        entity_id: storyUpdateId,
        detail: { count: drafts.length },
      });

      return { count: drafts.length };
    },

    async updateNotificationDraftStatus({
      actorUserId,
      draftId,
      input,
    }: UpdateNotificationDraftStatusArgs) {
      const parsed: NotificationDraftStatusInput = notificationDraftStatusSchema.parse(input);
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
