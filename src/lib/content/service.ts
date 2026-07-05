import { z } from "zod";
import {
  buildAdopterNotificationDrafts,
  type AdopterNotificationRecipient,
} from "./notificationDrafts";
import { validatePublishableContent } from "./rules";
import {
  contentInputSchema,
  contentSearchSchema,
  notificationDraftStatusSchema,
  publicContentSearchSchema,
  socialCopyGenerateSchema,
  socialCopyStatusSchema,
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
type SocialCopyGenerateInput = z.infer<typeof socialCopyGenerateSchema>;
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
  entity: "content_item" | "story_update" | "social_copy_variant" | "recipient_notification_draft";
  entity_id: string;
  detail: Record<string, unknown>;
  timestamp?: string;
};

export type ContentRepository = {
  listPublicContent(
    input: PublicContentSearch | z.infer<typeof publicContentSearchSchema>,
  ): Promise<{ items: ContentSummary[]; total: number }>;
  getPublicContentBySlug(slug: string): Promise<ContentDetail | null>;
  listPublicMapStories(input: PublicContentSearch): Promise<PublicStoryMapPoint[]>;
  listAdminContent(input: ContentSearch): Promise<{ items: ContentSummary[]; total: number }>;
  getAdminContent(id: string): Promise<ContentDetail | null>;
  createContent(input: ContentInput): Promise<string>;
  updateContent(id: string, input: Partial<ContentInput>): Promise<ContentDetail>;
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

function parseSocialCopyGenerateInput(raw: unknown): SocialCopyGenerateInput {
  const result = socialCopyGenerateSchema.safeParse(raw);
  if (result.success) return result.data;

  const input = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const parsed = socialCopyGenerateSchema.parse({ ...input, storyUpdateId: null });
  const storyUpdateId = typeof input.storyUpdateId === "string" ? input.storyUpdateId : null;

  return { ...parsed, storyUpdateId };
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

    async getPublicContentBySlug(slug: string) {
      return repo.getPublicContentBySlug(slug);
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
      const content = await repo.updateContent(contentId, parsed);
      await audit({
        actor_user_id: actorUserId,
        action: "content.update",
        entity: "content_item",
        entity_id: contentId,
        detail: parsed,
      });

      return content;
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
      void actorUserId;
      const parsed = parseSocialCopyGenerateInput(input);
      const content = await repo.getAdminContent(contentId);
      if (!content) throw new Error("Content item not found");

      const storyUpdate = parsed.storyUpdateId
        ? await repo.getStoryUpdate(parsed.storyUpdateId)
        : null;
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

      return { count: variants.length };
    },

    async updateSocialCopyStatus({ actorUserId, copyId, input }: UpdateSocialCopyStatusArgs) {
      void actorUserId;
      const parsed: SocialCopyStatusInput = socialCopyStatusSchema.parse(input);
      await repo.updateSocialCopyStatus(copyId, parsed.status);

      return { ok: true };
    },

    async generateNotificationDrafts({
      actorUserId,
      storyUpdateId,
    }: GenerateNotificationDraftsArgs) {
      void actorUserId;
      const update = await repo.getStoryUpdate(storyUpdateId);
      if (!update) throw new Error("Story update not found");

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

      return { count: drafts.length };
    },

    async updateNotificationDraftStatus({
      actorUserId,
      draftId,
      input,
    }: UpdateNotificationDraftStatusArgs) {
      void actorUserId;
      const parsed: NotificationDraftStatusInput = notificationDraftStatusSchema.parse(input);
      await repo.updateNotificationDraftStatus(draftId, parsed.status);

      return { ok: true };
    },
  };
}
