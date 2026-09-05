import type { SupabaseClient } from "@supabase/supabase-js";

import { isSafePublicHref, type ContentSearch, type PublicContentSearch } from "./schemas";
import type { ContentRepository } from "./service";
import type {
  ContentMedia,
  ContentStatus,
  ContentSummary,
  ContentType,
  PublicStoryMapPoint,
  RescueStoryProfile,
  StoryUpdate,
  StoryUpdateKind,
} from "./types";

type ContentListRow = {
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  subtitle: string | null;
  summary: string;
  cover_media_id: string | null;
  status: ContentStatus;
  published_at: string | null;
  cta_label: string | null;
  cta_url: string | null;
  created_at: string;
  updated_at: string;
};

type ProfileRow = {
  content_item_id: string;
  animal_type: RescueStoryProfile["animalType"];
  public_status: RescueStoryProfile["publicStatus"];
  rescue_region: string;
  rescue_date: string | null;
  show_on_map: boolean;
  public_map_label: string | null;
  public_lat: number | string | null;
  public_lng: number | string | null;
  internal_address: string | null;
  internal_location_notes: string | null;
  is_featured: boolean;
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

type PublicUpdateRow = {
  id: string;
  content_item_id: string;
  kind: StoryUpdateKind;
  title: string;
  body: string | null;
  occurred_at: string;
  visibility: "public";
  should_generate_adopter_drafts: boolean;
  created_at: string;
  updated_at: string;
};

export type ContentListReadModule = Pick<
  ContentRepository,
  "listAdminContent" | "listPublicContent" | "listPublicMapStories" | "listPublicStoriesPage"
>;

const contentColumns = [
  "id",
  "slug",
  "type",
  "title",
  "subtitle",
  "summary",
  "cover_media_id",
  "status",
  "published_at",
  "cta_label",
  "cta_url",
  "created_at",
  "updated_at",
].join(",");

const profileColumns = [
  "content_item_id",
  "animal_type",
  "public_status",
  "rescue_region",
  "rescue_date",
  "show_on_map",
  "public_map_label",
  "public_lat",
  "public_lng",
  "internal_address",
  "internal_location_notes",
  "is_featured",
].join(",");

const mediaColumns = [
  "id",
  "content_item_id",
  "story_update_id",
  "storage_bucket",
  "storage_path",
  "alt_text",
  "caption",
  "sort_order",
  "is_cover",
  "created_at",
  "updated_at",
].join(",");

const updateColumns = [
  "id",
  "content_item_id",
  "kind",
  "title",
  "body",
  "occurred_at",
  "visibility",
  "should_generate_adopter_drafts",
  "created_at",
  "updated_at",
].join(",");

function nullableNumber(value: number | string | null) {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapProfile(row: ProfileRow): RescueStoryProfile {
  return {
    contentItemId: row.content_item_id,
    animalType: row.animal_type,
    publicStatus: row.public_status,
    rescueRegion: row.rescue_region,
    rescueDate: row.rescue_date,
    showOnMap: row.show_on_map,
    publicMapLabel: row.public_map_label,
    publicLat: nullableNumber(row.public_lat),
    publicLng: nullableNumber(row.public_lng),
    internalAddress: row.internal_address,
    internalLocationNotes: row.internal_location_notes,
    isFeatured: row.is_featured,
  };
}

function mapMedia(client: SupabaseClient, row: MediaRow): ContentMedia {
  const { data } = client.storage.from(row.storage_bucket).getPublicUrl(row.storage_path);
  return {
    id: row.id,
    contentItemId: row.content_item_id,
    storyUpdateId: row.story_update_id,
    url: data?.publicUrl || row.storage_path,
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

function mapUpdate(row: PublicUpdateRow, media: ContentMedia[]): StoryUpdate {
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

async function loadRelations(client: SupabaseClient, contentIds: string[]) {
  const [profilesResult, mediaResult, updatesResult] = await Promise.all([
    client.from("rescue_story_profile").select(profileColumns).in("content_item_id", contentIds),
    client
      .from("content_media")
      .select(mediaColumns)
      .in("content_item_id", contentIds)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
    client
      .from("story_update")
      .select(updateColumns)
      .in("content_item_id", contentIds)
      .eq("visibility", "public")
      .eq("is_authoring_active", true)
      .order("occurred_at", { ascending: false }),
  ]);

  if (profilesResult.error) throw profilesResult.error;
  if (mediaResult.error) throw mediaResult.error;
  if (updatesResult.error) throw updatesResult.error;

  const profiles = (profilesResult.data ?? []) as unknown as ProfileRow[];
  const mediaRows = (mediaResult.data ?? []) as unknown as MediaRow[];
  const updateRows = (updatesResult.data ?? []) as unknown as PublicUpdateRow[];
  const profilesByContentId = new Map(
    profiles.map((row) => [row.content_item_id, mapProfile(row)]),
  );
  const media = mediaRows.map((row) => mapMedia(client, row));
  const mediaByContentId = new Map<string, ContentMedia[]>();
  const mediaByUpdateId = new Map<string, ContentMedia[]>();

  for (const item of media) {
    const contentItems = mediaByContentId.get(item.contentItemId) ?? [];
    contentItems.push(item);
    mediaByContentId.set(item.contentItemId, contentItems);
    if (item.storyUpdateId) {
      const updateItems = mediaByUpdateId.get(item.storyUpdateId) ?? [];
      updateItems.push(item);
      mediaByUpdateId.set(item.storyUpdateId, updateItems);
    }
  }

  const latestUpdateByContentId = new Map<string, StoryUpdate>();
  const publicUpdateIdsByContentId = new Map<string, Set<string>>();
  for (const row of updateRows) {
    const ids = publicUpdateIdsByContentId.get(row.content_item_id) ?? new Set<string>();
    ids.add(row.id);
    publicUpdateIdsByContentId.set(row.content_item_id, ids);

    const update = mapUpdate(row, mediaByUpdateId.get(row.id) ?? []);
    const current = latestUpdateByContentId.get(row.content_item_id);
    if (!current || update.occurredAt > current.occurredAt) {
      latestUpdateByContentId.set(row.content_item_id, update);
    }
  }

  return {
    profilesByContentId,
    mediaByContentId,
    latestUpdateByContentId,
    publicUpdateIdsByContentId,
  };
}

function assembleAdminSummary(
  row: ContentListRow,
  relations: Awaited<ReturnType<typeof loadRelations>>,
): ContentSummary {
  const media = relations.mediaByContentId.get(row.id) ?? [];
  const cover = findCoverMedia(media, row.cover_media_id);
  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    coverMediaId: row.cover_media_id,
    coverImageUrl: cover?.url ?? null,
    status: row.status,
    publishedAt: row.published_at,
    ctaLabel: row.cta_label,
    ctaUrl: row.cta_url,
    storyProfile: relations.profilesByContentId.get(row.id) ?? null,
    latestPublicUpdate: relations.latestUpdateByContentId.get(row.id) ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assemblePublicSummary(
  row: ContentListRow,
  relations: Awaited<ReturnType<typeof loadRelations>>,
): ContentSummary {
  const profile = relations.profilesByContentId.get(row.id) ?? null;
  const latestUpdate = relations.latestUpdateByContentId.get(row.id) ?? null;
  const publicUpdateIds = relations.publicUpdateIdsByContentId.get(row.id) ?? new Set();
  const visibleMedia = (relations.mediaByContentId.get(row.id) ?? []).filter(
    (item) => item.storyUpdateId === null || publicUpdateIds.has(item.storyUpdateId),
  );
  const cover = findCoverMedia(visibleMedia, row.cover_media_id);

  return {
    id: row.id,
    slug: row.slug,
    type: row.type,
    title: row.title,
    subtitle: row.subtitle,
    summary: row.summary,
    coverMediaId: cover?.id ?? null,
    coverImageUrl: cover?.url ?? null,
    status: row.status,
    publishedAt: row.published_at,
    ctaLabel: row.cta_label,
    ctaUrl: isSafePublicHref(row.cta_url) ? row.cta_url : null,
    storyProfile: profile
      ? { ...profile, internalAddress: null, internalLocationNotes: null }
      : null,
    latestPublicUpdate: latestUpdate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function retainPublishedRows(rows: ContentListRow[]) {
  return rows.filter((row) => row.status === "published");
}

function findCoverMedia(media: ContentMedia[], coverMediaId: string | null) {
  return (
    (coverMediaId ? media.find((item) => item.id === coverMediaId) : null) ??
    media.find((item) => item.isCover) ??
    null
  );
}

function nonNullable<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function mapStoryPoint(content: ContentSummary): PublicStoryMapPoint | null {
  const profile = content.storyProfile;
  if (!profile?.showOnMap) return null;
  if (!profile.publicMapLabel?.trim()) return null;
  if (profile.publicLat === null || profile.publicLng === null) return null;
  return {
    id: content.id,
    slug: content.slug,
    title: content.title,
    animalType: profile.animalType,
    publicStatus: profile.publicStatus,
    rescueRegion: profile.rescueRegion,
    publicMapLabel: profile.publicMapLabel,
    lat: profile.publicLat,
    lng: profile.publicLng,
    latestUpdateTitle: content.latestPublicUpdate?.title ?? null,
  };
}

function mapStoryPoints(
  rows: ContentListRow[],
  relations: Awaited<ReturnType<typeof loadRelations>>,
): PublicStoryMapPoint[] {
  return rows
    .map((row) => mapStoryPoint(assemblePublicSummary(row, relations)))
    .filter(nonNullable);
}

function escapeLike(value: string) {
  return value.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}

type StoryFilters = Pick<ContentSearch, "animalType" | "publicStatus" | "rescueRegion">;

function hasStoryFilters(input: StoryFilters) {
  return Boolean(input.animalType || input.publicStatus || input.rescueRegion);
}

function unique(values: string[]) {
  return [...new Set(values)];
}

async function storyFilterContentIds(client: SupabaseClient, input: StoryFilters) {
  if (!hasStoryFilters(input)) return null;

  let query = client.from("rescue_story_profile").select("content_item_id");
  if (input.animalType) query = query.eq("animal_type", input.animalType);
  if (input.publicStatus) query = query.eq("public_status", input.publicStatus);
  if (input.rescueRegion) query = query.eq("rescue_region", input.rescueRegion);

  const { data, error } = await query;
  if (error) throw error;
  return unique(
    ((data ?? []) as Array<{ content_item_id: string }>).map((row) => row.content_item_id),
  );
}

export function createSupabaseContentListRead(client: SupabaseClient): ContentListReadModule {
  return {
    async listPublicMapStories(input: PublicContentSearch) {
      if (input.type && input.type !== "rescue_story") return [];

      const storyIds = await storyFilterContentIds(client, input);
      if (storyIds && storyIds.length === 0) return [];

      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("content_item")
        .select(contentColumns)
        .eq("status", "published")
        .eq("type", "rescue_story")
        .order("published_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(`title.ilike.${like},summary.ilike.${like}`);
      }
      if (storyIds) query = query.in("id", storyIds);

      const { data, error } = await query;
      if (error) throw error;
      const rows = retainPublishedRows((data ?? []) as unknown as ContentListRow[]);
      if (rows.length === 0) return [];

      const relations = await loadRelations(
        client,
        rows.map((row) => row.id),
      );
      return mapStoryPoints(rows, relations);
    },

    async listPublicContent(input: PublicContentSearch) {
      const storyIds = await storyFilterContentIds(client, input);
      if (storyIds && storyIds.length === 0) return { items: [], total: 0 };

      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("content_item")
        .select(contentColumns, { count: "exact" })
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.type) query = query.eq("type", input.type);
      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(`title.ilike.${like},summary.ilike.${like}`);
      }
      if (storyIds) query = query.in("id", storyIds);

      const { data, error, count } = await query;
      if (error) throw error;
      const rawRows = (data ?? []) as unknown as ContentListRow[];
      const rows = retainPublishedRows(rawRows);
      if (rows.length === 0) return { items: [], total: rawRows.length === 0 ? (count ?? 0) : 0 };

      const relations = await loadRelations(
        client,
        rows.map((row) => row.id),
      );
      return {
        items: rows.map((row) => assemblePublicSummary(row, relations)),
        total: rows.length === rawRows.length ? (count ?? 0) : rows.length,
      };
    },

    async listPublicStoriesPage(input: PublicContentSearch) {
      const storyIds = await storyFilterContentIds(client, input);
      if (storyIds && storyIds.length === 0) return { items: [], total: 0, points: [] };

      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("content_item")
        .select(contentColumns, { count: "exact" })
        .eq("status", "published")
        .order("published_at", { ascending: false })
        .range(from, from + input.pageSize - 1);

      if (input.type) query = query.eq("type", input.type);
      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(`title.ilike.${like},summary.ilike.${like}`);
      }
      if (storyIds) query = query.in("id", storyIds);

      const { data, error, count } = await query;
      if (error) throw error;
      const rawRows = (data ?? []) as unknown as ContentListRow[];
      const rows = retainPublishedRows(rawRows);
      if (rows.length === 0)
        return { items: [], total: rawRows.length === 0 ? (count ?? 0) : 0, points: [] };

      const relations = await loadRelations(
        client,
        rows.map((row) => row.id),
      );
      const items = rows.map((row) => assemblePublicSummary(row, relations));
      return {
        items,
        total: rows.length === rawRows.length ? (count ?? 0) : rows.length,
        points: items.map(mapStoryPoint).filter(nonNullable),
      };
    },
    async listAdminContent(input: ContentSearch) {
      const storyIds = await storyFilterContentIds(client, input);
      if (storyIds && storyIds.length === 0) return { items: [], total: 0 };

      const from = (input.page - 1) * input.pageSize;
      let query = client
        .from("content_item")
        .select(contentColumns, { count: "exact" })
        .order("updated_at", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .range(from, from + input.pageSize - 1);

      if (input.status) query = query.eq("status", input.status);
      if (input.type) query = query.eq("type", input.type);
      if (input.q) {
        const like = `%${escapeLike(input.q)}%`;
        query = query.or(`title.ilike.${like},summary.ilike.${like}`);
      }
      if (storyIds) query = query.in("id", storyIds);

      const { data, error, count } = await query;
      if (error) throw error;
      const rows = (data ?? []) as unknown as ContentListRow[];
      if (rows.length === 0) return { items: [], total: count ?? 0 };

      const relations = await loadRelations(
        client,
        rows.map((row) => row.id),
      );
      return { items: rows.map((row) => assembleAdminSummary(row, relations)), total: count ?? 0 };
    },
  };
}
