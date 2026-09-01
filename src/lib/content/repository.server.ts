import type { SupabaseClient } from "@supabase/supabase-js";

import { createSupabaseContentListRead } from "./contentListRead.server";
import type { AdopterNotificationRecipient } from "./notificationDrafts";
import {
  CONTENT_MEDIA_BUCKET,
  isSafePublicHref,
  type ContentInput,
  type ContentLinkInput,
  type ContentMediaInput,
  type StoryProfileInput,
  type StoryUpdateInput,
} from "./schemas";
import type { ContentAuditLogInsert, ContentRepository } from "./service";
import type {
  AnimalStoryType,
  ContentDetail,
  ContentLink,
  ContentMedia,
  ContentStatus,
  ContentSummary,
  ContentType,
  NotificationDraftStatus,
  RecipientNotificationDraft,
  RescuePublicStatus,
  RescueStoryProfile,
  SocialCopyStatus,
  SocialCopyVariant,
  SocialPlatform,
  StoryUpdate,
  StoryUpdateKind,
  StoryUpdateVisibility,
} from "./types";

type ContentRow = {
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  subtitle: string | null;
  summary: string;
  body: string | null;
  cover_media_id: string | null;
  status: ContentStatus;
  published_at: string | null;
  cta_label: string | null;
  cta_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  og_title: string | null;
  og_description: string | null;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
};

type StoryUpdateRow = {
  id: string;
  content_item_id: string;
  kind: StoryUpdateKind;
  title: string;
  body: string | null;
  occurred_at: string;
  visibility: StoryUpdateVisibility;
  should_generate_adopter_drafts: boolean;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
};

type MediaRow = {
  id: string;
  content_item_id: string;
  story_update_id: string | null;
  storage_bucket: string;
  storage_path: string;
  alt_text: string;
  caption: string | null;
  sort_order: number;
  is_cover: boolean;
  created_at: string;
  updated_at: string;
};

type ContentLinkRow = {
  id: string;
  content_item_id: string;
  linked_type: ContentLink["linkedType"];
  linked_id: string;
  relationship: ContentLink["relationship"];
  created_at: string;
  updated_at: string;
};

type RescueStoryProfileRow = {
  content_item_id: string;
  animal_type: AnimalStoryType;
  public_status: RescuePublicStatus;
  rescue_region: string;
  rescue_date: string | null;
  show_on_map: boolean;
  public_map_label: string | null;
  public_lat: number | string | null;
  public_lng: number | string | null;
  internal_address: string | null;
  internal_location_notes: string | null;
  is_featured: boolean;
  created_at?: string;
  updated_at?: string;
};

type SocialCopyVariantRow = {
  id: string;
  content_item_id: string;
  story_update_id: string | null;
  platform: SocialPlatform;
  language: "zh-HK";
  copy_text: string;
  hashtags: string[];
  status: SocialCopyStatus;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
};

type RecipientNotificationDraftRow = {
  id: string;
  story_update_id: string;
  content_item_id: string;
  adoption_case_id: string | null;
  supporter_id: string | null;
  channel: RecipientNotificationDraft["channel"];
  recipient_name: string;
  recipient_contact: string;
  subject: string | null;
  body: string;
  status: NotificationDraftStatus;
  created_by?: string | null;
  updated_by?: string | null;
  created_at: string;
  updated_at: string;
};

type AdoptionCaseRow = {
  id: string;
  supporter_id: string | null;
  applicant_name: string;
  applicant_email: string | null;
  applicant_phone: string | null;
};

type SuccessfulAdoptionRow = {
  id: string;
  adoption_case_id: string;
  supporter_id: string | null;
};

type SupporterRow = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
};

function nonNullable<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function unique(values: string[]) {
  return Array.from(new Set(values));
}

function toNullableNumber(value: number | string | null): number | null {
  if (value === null) return null;
  const numeric = typeof value === "number" ? value : Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function latestPublicUpdate(updates: StoryUpdate[]) {
  return (
    updates
      .filter((update) => update.visibility === "public")
      .sort((a, b) => b.occurredAt.localeCompare(a.occurredAt))[0] ?? null
  );
}

export function toContentSummary(row: ContentRow): ContentSummary {
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    coverMediaId: row.cover_media_id,
    coverImageUrl: null,
    status: row.status,
    publishedAt: row.published_at,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    storyProfile: null,
    latestPublicUpdate: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toContentMedia(row: MediaRow, publicUrl: string | null): ContentMedia {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    storyUpdateId: row.story_update_id,
    url: publicUrl || row.storage_path,
    storageBucket: row.storage_bucket,
    storagePath: row.storage_path,
    altText: row.alt_text,
    caption: row.caption,
    sortOrder: row.sort_order,
    isCover: row.is_cover,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function toStoryUpdate(row: StoryUpdateRow, media: ContentMedia[]): StoryUpdate {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    kind: row.kind,
    title: row.title,
    body: row.body,
    occurredAt: row.occurred_at,
    visibility: row.visibility,
    shouldGenerateAdopterDrafts: row.should_generate_adopter_drafts,
    media,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRescueStoryProfile(row: RescueStoryProfileRow): RescueStoryProfile {
  return {
    contentItemId: row.content_item_id,
    animalType: row.animal_type,
    publicStatus: row.public_status,
    rescueRegion: row.rescue_region,
    rescueDate: row.rescue_date,
    showOnMap: row.show_on_map,
    publicMapLabel: row.public_map_label,
    publicLat: toNullableNumber(row.public_lat),
    publicLng: toNullableNumber(row.public_lng),
    internalAddress: row.internal_address,
    internalLocationNotes: row.internal_location_notes,
    isFeatured: row.is_featured,
  };
}

function toContentLink(row: ContentLinkRow): ContentLink {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    linkedType: row.linked_type,
    linkedId: row.linked_id,
    relationship: row.relationship,
    label: null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toSocialCopyVariant(row: SocialCopyVariantRow): SocialCopyVariant {
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    storyUpdateId: row.story_update_id,
    platform: row.platform,
    language: row.language,
    copyText: row.copy_text,
    hashtags: row.hashtags,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRecipientNotificationDraft(
  row: RecipientNotificationDraftRow,
): RecipientNotificationDraft {
  return {
    id: row.id,
    storyUpdateId: row.story_update_id,
    contentItemId: row.content_item_id,
    adoptionCaseId: row.adoption_case_id,
    supporterId: row.supporter_id,
    channel: row.channel,
    recipientName: row.recipient_name,
    recipientContact: row.recipient_contact,
    subject: row.subject,
    body: row.body,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mediaPublicUrl(client: SupabaseClient, row: MediaRow) {
  const { data } = client.storage.from(row.storage_bucket).getPublicUrl(row.storage_path);
  return data?.publicUrl || null;
}

function toContentInsert(input: ContentInput) {
  return {
    type: input.type,
    slug: input.slug,
    title: input.title,
    subtitle: input.subtitle,
    summary: input.summary,
    body: input.body,
    cover_media_id: input.coverMediaId,
    status: input.status,
    published_at: input.publishedAt,
    cta_label: input.ctaLabel,
    cta_url: input.ctaUrl,
    seo_title: input.seoTitle,
    seo_description: input.seoDescription,
    og_title: input.ogTitle,
    og_description: input.ogDescription,
  };
}

function toContentUpdate(input: Partial<ContentInput>) {
  const payload: Record<string, unknown> = {};
  if (input.type !== undefined) payload.type = input.type;
  if (input.slug !== undefined) payload.slug = input.slug;
  if (input.title !== undefined) payload.title = input.title;
  if (input.subtitle !== undefined) payload.subtitle = input.subtitle;
  if (input.summary !== undefined) payload.summary = input.summary;
  if (input.body !== undefined) payload.body = input.body;
  if (input.coverMediaId !== undefined) payload.cover_media_id = input.coverMediaId;
  if (input.status !== undefined) payload.status = input.status;
  if (input.publishedAt !== undefined) payload.published_at = input.publishedAt;
  if (input.ctaLabel !== undefined) payload.cta_label = input.ctaLabel;
  if (input.ctaUrl !== undefined) payload.cta_url = input.ctaUrl;
  if (input.seoTitle !== undefined) payload.seo_title = input.seoTitle;
  if (input.seoDescription !== undefined) payload.seo_description = input.seoDescription;
  if (input.ogTitle !== undefined) payload.og_title = input.ogTitle;
  if (input.ogDescription !== undefined) payload.og_description = input.ogDescription;
  return payload;
}

export function toStoryProfileUpsert(contentId: string, input: StoryProfileInput) {
  return {
    content_item_id: contentId,
    animal_type: input.animalType,
    public_status: input.publicStatus,
    rescue_region: input.rescueRegion,
    rescue_date: input.rescueDate,
    show_on_map: input.showOnMap,
    public_map_label: input.publicMapLabel,
    public_lat: input.publicLat,
    public_lng: input.publicLng,
    internal_address: input.internalAddress,
    internal_location_notes: input.internalLocationNotes,
    is_featured: input.isFeatured,
  };
}

export function toStoryUpdateInsert(contentId: string, input: StoryUpdateInput) {
  return {
    content_item_id: contentId,
    kind: input.kind,
    title: input.title,
    body: input.body,
    occurred_at: input.occurredAt,
    visibility: input.visibility,
    should_generate_adopter_drafts: input.shouldGenerateAdopterDrafts,
  };
}

export function toContentMediaInsert(contentId: string, input: ContentMediaInput) {
  return {
    content_item_id: contentId,
    story_update_id: input.storyUpdateId,
    storage_bucket: CONTENT_MEDIA_BUCKET,
    storage_path: input.storagePath,
    alt_text: input.altText,
    caption: input.caption,
    sort_order: input.sortOrder,
    is_cover: input.isCover,
  };
}

export function toContentLinkInsert(contentId: string, input: ContentLinkInput) {
  return {
    content_item_id: contentId,
    linked_type: input.linkedType,
    linked_id: input.linkedId,
    relationship: input.relationship,
  };
}

function findCoverMedia(media: ContentMedia[], coverMediaId: string | null) {
  return (
    (coverMediaId ? media.find((item) => item.id === coverMediaId) : null) ??
    media.find((item) => item.isCover) ??
    null
  );
}

function buildContentDetail(
  row: ContentRow,
  storyProfile: RescueStoryProfile | null,
  links: ContentLink[],
  media: ContentMedia[],
  updates: StoryUpdate[],
  socialCopies: SocialCopyVariant[],
  notificationDrafts: RecipientNotificationDraft[],
): ContentDetail {
  const summary = toContentSummary(row);
  const coverMedia = findCoverMedia(media, row.cover_media_id);

  return {
    ...summary,
    coverImageUrl: coverMedia?.url ?? null,
    storyProfile,
    latestPublicUpdate: latestPublicUpdate(updates),
    body: row.body,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    ogTitle: row.og_title,
    ogDescription: row.og_description,
    links,
    media,
    updates,
    socialCopies,
    notificationDrafts,
  };
}

async function hydrateContentDetail(
  client: SupabaseClient,
  row: ContentRow,
): Promise<ContentDetail> {
  const { data: profileRow, error: profileError } = await client
    .from("rescue_story_profile")
    .select("*")
    .eq("content_item_id", row.id)
    .maybeSingle();
  if (profileError) throw profileError;

  const { data: linkRows, error: linkError } = await client
    .from("content_link")
    .select("*")
    .eq("content_item_id", row.id)
    .order("created_at", { ascending: true });
  if (linkError) throw linkError;

  const { data: mediaRows, error: mediaError } = await client
    .from("content_media")
    .select("*")
    .eq("content_item_id", row.id)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });
  if (mediaError) throw mediaError;

  const media = ((mediaRows ?? []) as MediaRow[]).map((mediaRow) =>
    toContentMedia(mediaRow, mediaPublicUrl(client, mediaRow)),
  );

  const { data: updateRows, error: updateError } = await client
    .from("story_update")
    .select("*")
    .eq("content_item_id", row.id)
    .order("occurred_at", { ascending: false });
  if (updateError) throw updateError;

  const updates = ((updateRows ?? []) as StoryUpdateRow[]).map((updateRow) =>
    toStoryUpdate(
      updateRow,
      media.filter((item) => item.storyUpdateId === updateRow.id),
    ),
  );

  const { data: socialRows, error: socialError } = await client
    .from("social_copy_variant")
    .select("*")
    .eq("content_item_id", row.id)
    .order("created_at", { ascending: false });
  if (socialError) throw socialError;

  const { data: notificationRows, error: notificationError } = await client
    .from("recipient_notification_draft")
    .select("*")
    .eq("content_item_id", row.id)
    .order("created_at", { ascending: false });
  if (notificationError) throw notificationError;

  return buildContentDetail(
    row,
    profileRow ? toRescueStoryProfile(profileRow as RescueStoryProfileRow) : null,
    ((linkRows ?? []) as ContentLinkRow[]).map(toContentLink),
    media,
    updates,
    ((socialRows ?? []) as SocialCopyVariantRow[]).map(toSocialCopyVariant),
    ((notificationRows ?? []) as RecipientNotificationDraftRow[]).map(toRecipientNotificationDraft),
  );
}

export function toPublicContentDetail(detail: ContentDetail): ContentDetail {
  const updates = detail.updates.filter((update) => update.visibility === "public");
  const publicUpdateIds = new Set(updates.map((update) => update.id));
  const media = detail.media.filter(
    (item) => item.storyUpdateId === null || publicUpdateIds.has(item.storyUpdateId),
  );
  const coverMedia = findCoverMedia(media, detail.coverMediaId);
  const ctaUrl = isSafePublicHref(detail.ctaUrl) ? detail.ctaUrl : null;

  return {
    ...detail,
    coverMediaId: coverMedia?.id ?? null,
    coverImageUrl: coverMedia?.url ?? null,
    ctaUrl,
    storyProfile: detail.storyProfile
      ? {
          ...detail.storyProfile,
          internalAddress: null,
          internalLocationNotes: null,
        }
      : null,
    links: [],
    media,
    updates,
    latestPublicUpdate: latestPublicUpdate(updates),
    socialCopies: [],
    notificationDrafts: [],
  };
}

async function getContentDetailById(client: SupabaseClient, id: string) {
  const { data, error } = await client.from("content_item").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return hydrateContentDetail(client, data as ContentRow);
}

async function getContentDetailByIdOrThrow(client: SupabaseClient, id: string) {
  const detail = await getContentDetailById(client, id);
  if (!detail) throw new Error("Content item not found");
  return detail;
}

function normalizeText(value: string | null | undefined) {
  const next = value?.trim();
  return next ? next : null;
}

function recipientKey(recipient: AdopterNotificationRecipient) {
  if (recipient.supporterId) return `supporter:${recipient.supporterId}`;
  const email = normalizeText(recipient.email)?.toLowerCase();
  if (email) return `email:${email}`;
  const phone = normalizeText(recipient.phone)?.toLowerCase();
  if (phone) return `phone:${phone}`;
  return `case:${recipient.adoptionCaseId ?? recipient.name.toLowerCase()}`;
}

function buildRecipient(input: {
  adoptionCase: AdoptionCaseRow | null;
  adoptionCaseId: string | null;
  supporter: SupporterRow | null;
  supporterId: string | null;
}) {
  const name =
    normalizeText(input.supporter?.name) ?? normalizeText(input.adoptionCase?.applicant_name);
  const email =
    normalizeText(input.supporter?.email) ?? normalizeText(input.adoptionCase?.applicant_email);
  const phone =
    normalizeText(input.supporter?.phone) ?? normalizeText(input.adoptionCase?.applicant_phone);

  if (!name || (!email && !phone)) return null;

  return {
    adoptionCaseId: input.adoptionCaseId,
    supporterId: input.supporterId,
    name,
    email,
    phone,
  } satisfies AdopterNotificationRecipient;
}

async function loadAdoptionCases(client: SupabaseClient, ids: string[]) {
  const rows = new Map<string, AdoptionCaseRow>();
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return rows;

  const { data, error } = await client
    .from("adoption_case")
    .select("id,supporter_id,applicant_name,applicant_email,applicant_phone")
    .in("id", uniqueIds);
  if (error) throw error;

  for (const row of (data ?? []) as AdoptionCaseRow[]) {
    rows.set(row.id, row);
  }
  return rows;
}

async function loadSupporters(client: SupabaseClient, ids: string[]) {
  const rows = new Map<string, SupporterRow>();
  const uniqueIds = unique(ids);
  if (uniqueIds.length === 0) return rows;

  const { data, error } = await client
    .from("supporter")
    .select("id,name,email,phone")
    .in("id", uniqueIds);
  if (error) throw error;

  for (const row of (data ?? []) as SupporterRow[]) {
    rows.set(row.id, row);
  }
  return rows;
}

export function createSupabaseContentRepository(client: SupabaseClient): ContentRepository {
  const contentListRead = createSupabaseContentListRead(client);

  return {
    listPublicContent(input) {
      return contentListRead.listPublicContent(input);
    },

    listPublicStoriesPage(input) {
      return contentListRead.listPublicStoriesPage(input);
    },

    async getPublicContentBySlug(slug) {
      const { data, error } = await client
        .from("content_item")
        .select("*")
        .eq("slug", slug)
        .eq("status", "published")
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      return toPublicContentDetail(await hydrateContentDetail(client, data as ContentRow));
    },

    listPublicMapStories(input) {
      return contentListRead.listPublicMapStories(input);
    },

    listAdminContent(input) {
      return contentListRead.listAdminContent(input);
    },

    getAdminContent(id) {
      return getContentDetailById(client, id);
    },

    async createContent(input) {
      const { data, error } = await client
        .from("content_item")
        .insert(toContentInsert(input))
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async updateContent(id, input) {
      const payload = toContentUpdate(input);
      if (Object.keys(payload).length === 0) return getContentDetailByIdOrThrow(client, id);

      const { data, error } = await client
        .from("content_item")
        .update(payload)
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return hydrateContentDetail(client, data as ContentRow);
    },

    async upsertStoryProfile(contentId, input) {
      const { error } = await client
        .from("rescue_story_profile")
        .upsert(toStoryProfileUpsert(contentId, input), { onConflict: "content_item_id" })
        .select("content_item_id")
        .single();
      if (error) throw error;

      return getContentDetailByIdOrThrow(client, contentId);
    },

    async createStoryUpdate(contentId, input) {
      const { data, error } = await client
        .from("story_update")
        .insert(toStoryUpdateInsert(contentId, input))
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async createContentMedia(contentId, input) {
      const { data, error } = await client
        .from("content_media")
        .insert(toContentMediaInsert(contentId, input))
        .select("id")
        .single();
      if (error) throw error;

      const mediaId = data.id as string;
      if (input.isCover) {
        const { error: coverError } = await client
          .from("content_item")
          .update({ cover_media_id: mediaId })
          .eq("id", contentId)
          .select("id")
          .single();
        if (coverError) throw coverError;
      }

      return mediaId;
    },

    async createSignedUploadUrl(objectPath: string) {
      const { data, error } = await client.storage
        .from(CONTENT_MEDIA_BUCKET)
        .createSignedUploadUrl(objectPath);
      if (error) throw error;
      if (!data?.token || !data.path) throw new Error("Storage did not return an upload target");
      return { token: data.token, path: data.path };
    },

    async createContentLink(contentId, input) {
      const { data, error } = await client
        .from("content_link")
        .insert(toContentLinkInsert(contentId, input))
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },

    async publishContent(id) {
      const { data, error } = await client
        .from("content_item")
        .update({ status: "published" })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return hydrateContentDetail(client, data as ContentRow);
    },

    async archiveContent(id) {
      const { data, error } = await client
        .from("content_item")
        .update({ status: "archived" })
        .eq("id", id)
        .select("*")
        .single();
      if (error) throw error;
      return hydrateContentDetail(client, data as ContentRow);
    },

    async insertSocialCopies(rows) {
      if (rows.length === 0) return;
      const { error } = await client.from("social_copy_variant").insert(
        rows.map((row) => ({
          content_item_id: row.contentItemId,
          story_update_id: row.storyUpdateId,
          platform: row.platform,
          language: row.language,
          copy_text: row.copyText,
          hashtags: row.hashtags,
          status: row.status,
        })),
      );
      if (error) throw error;
    },

    async getStoryUpdate(id) {
      const { data, error } = await client
        .from("story_update")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;

      const { data: mediaRows, error: mediaError } = await client
        .from("content_media")
        .select("*")
        .eq("story_update_id", id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: true });
      if (mediaError) throw mediaError;

      const media = ((mediaRows ?? []) as MediaRow[]).map((row) =>
        toContentMedia(row, mediaPublicUrl(client, row)),
      );
      return toStoryUpdate(data as StoryUpdateRow, media);
    },

    async resolveAdopterRecipients(contentId) {
      const { data: linkRows, error: linkError } = await client
        .from("content_link")
        .select("*")
        .eq("content_item_id", contentId)
        .in("linked_type", ["adoption_case", "successful_adoption"]);
      if (linkError) throw linkError;

      const links = (linkRows ?? []) as ContentLinkRow[];
      const directAdoptionCaseIds = links
        .filter((row) => row.linked_type === "adoption_case")
        .map((row) => row.linked_id);
      const successfulAdoptionIds = links
        .filter((row) => row.linked_type === "successful_adoption")
        .map((row) => row.linked_id);

      let successfulAdoptions: SuccessfulAdoptionRow[] = [];
      if (successfulAdoptionIds.length > 0) {
        const { data, error } = await client
          .from("successful_adoption")
          .select("id,adoption_case_id,supporter_id")
          .in("id", unique(successfulAdoptionIds));
        if (error) throw error;
        successfulAdoptions = (data ?? []) as SuccessfulAdoptionRow[];
      }

      const adoptionCases = await loadAdoptionCases(
        client,
        directAdoptionCaseIds.concat(
          successfulAdoptions.map((row) => row.adoption_case_id).filter(nonNullable),
        ),
      );
      const supporterIds = unique(
        Array.from(adoptionCases.values())
          .map((row) => row.supporter_id)
          .concat(successfulAdoptions.map((row) => row.supporter_id))
          .filter(nonNullable),
      );
      const supporters = await loadSupporters(client, supporterIds);

      const recipients = new Map<string, AdopterNotificationRecipient>();
      const addRecipient = (recipient: AdopterNotificationRecipient | null) => {
        if (!recipient) return;
        const key = recipientKey(recipient);
        if (!recipients.has(key)) recipients.set(key, recipient);
      };

      for (const adoptionCaseId of directAdoptionCaseIds) {
        const adoptionCase = adoptionCases.get(adoptionCaseId) ?? null;
        const supporterId = adoptionCase?.supporter_id ?? null;
        addRecipient(
          buildRecipient({
            adoptionCase,
            adoptionCaseId,
            supporter: supporterId ? (supporters.get(supporterId) ?? null) : null,
            supporterId,
          }),
        );
      }

      for (const successfulAdoption of successfulAdoptions) {
        const adoptionCase = adoptionCases.get(successfulAdoption.adoption_case_id) ?? null;
        const supporterId = successfulAdoption.supporter_id ?? adoptionCase?.supporter_id ?? null;
        addRecipient(
          buildRecipient({
            adoptionCase,
            adoptionCaseId: successfulAdoption.adoption_case_id,
            supporter: supporterId ? (supporters.get(supporterId) ?? null) : null,
            supporterId,
          }),
        );
      }

      return Array.from(recipients.values());
    },

    async insertNotificationDrafts(rows) {
      if (rows.length === 0) return;
      const { error } = await client.from("recipient_notification_draft").insert(
        rows.map((row) => ({
          story_update_id: row.storyUpdateId,
          content_item_id: row.contentItemId,
          adoption_case_id: row.adoptionCaseId,
          supporter_id: row.supporterId,
          channel: row.channel,
          recipient_name: row.recipientName,
          recipient_contact: row.recipientContact,
          subject: row.subject,
          body: row.body,
          status: row.status,
        })),
      );
      if (error) throw error;
    },

    async updateNotificationDraftStatus(id, status) {
      const { error } = await client
        .from("recipient_notification_draft")
        .update({ status })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },

    async updateSocialCopyStatus(id, status) {
      const { error } = await client
        .from("social_copy_variant")
        .update({ status })
        .eq("id", id)
        .select("id")
        .single();
      if (error) throw error;
    },

    async insertAuditLog(row: ContentAuditLogInsert) {
      const { error } = await client.from("audit_log").insert({
        actor_user_id: row.actor_user_id,
        action: row.action,
        entity: row.entity,
        entity_id: row.entity_id,
        timestamp: row.timestamp,
        detail: row.detail,
      });
      if (error) throw error;
    },
  };
}
