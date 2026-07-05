export const contentTypes = ["rescue_story", "event", "charity_market", "report"] as const;
export const contentStatuses = ["draft", "published", "archived"] as const;
export const animalStoryTypes = ["cat", "dog", "mixed", "unknown"] as const;
export const rescuePublicStatuses = [
  "rescued",
  "medical_care",
  "foster_recovery",
  "ready_for_adoption",
  "adopted",
  "sponsor_needed",
  "closed",
] as const;
export const storyUpdateKinds = [
  "medical",
  "care",
  "photo",
  "foster",
  "adoption",
  "general",
] as const;
export const storyUpdateVisibilities = ["public", "internal"] as const;
export const socialPlatforms = ["facebook", "instagram", "whatsapp"] as const;
export const socialCopyStatuses = ["draft", "copied", "archived"] as const;
export const notificationDraftStatuses = ["draft", "copied", "sent_manually", "dismissed"] as const;

export type ContentType = (typeof contentTypes)[number];
export type ContentStatus = (typeof contentStatuses)[number];
export type AnimalStoryType = (typeof animalStoryTypes)[number];
export type RescuePublicStatus = (typeof rescuePublicStatuses)[number];
export type StoryUpdateKind = (typeof storyUpdateKinds)[number];
export type StoryUpdateVisibility = (typeof storyUpdateVisibilities)[number];
export type SocialPlatform = (typeof socialPlatforms)[number];
export type SocialCopyStatus = (typeof socialCopyStatuses)[number];
export type NotificationDraftStatus = (typeof notificationDraftStatuses)[number];

export type ContentLink = {
  id: string;
  contentItemId: string;
  linkedType:
    | "animal"
    | "adoption_case"
    | "successful_adoption"
    | "supporter"
    | "volunteer_activity";
  linkedId: string;
  relationship: "primary_subject" | "related_case" | "adopter" | "volunteer_context" | "other";
  label?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type RescueStoryProfile = {
  contentItemId: string;
  animalType: AnimalStoryType;
  publicStatus: RescuePublicStatus;
  rescueRegion: string;
  rescueDate: string | null;
  showOnMap: boolean;
  publicMapLabel: string | null;
  publicLat: number | null;
  publicLng: number | null;
  internalAddress: string | null;
  internalLocationNotes: string | null;
  isFeatured: boolean;
};

export type StoryUpdate = {
  id: string;
  contentItemId: string;
  kind: StoryUpdateKind;
  title: string;
  body: string | null;
  occurredAt: string;
  visibility: StoryUpdateVisibility;
  shouldGenerateAdopterDrafts: boolean;
  media: ContentMedia[];
  createdAt: string;
  updatedAt: string;
};

export type ContentMedia = {
  id: string;
  contentItemId: string;
  storyUpdateId: string | null;
  url: string;
  storageBucket: string;
  storagePath: string;
  altText: string;
  caption: string | null;
  sortOrder: number;
  isCover: boolean;
  createdAt: string;
  updatedAt: string;
};

export type SocialCopyVariant = {
  id: string;
  contentItemId: string;
  storyUpdateId: string | null;
  platform: SocialPlatform;
  language: "zh-HK";
  copyText: string;
  hashtags: string[];
  status: SocialCopyStatus;
  createdAt: string;
  updatedAt: string;
};

export type RecipientNotificationDraft = {
  id: string;
  storyUpdateId: string;
  contentItemId: string;
  adoptionCaseId: string | null;
  supporterId: string | null;
  channel: "email" | "whatsapp";
  recipientName: string;
  recipientContact: string;
  subject: string | null;
  body: string;
  status: NotificationDraftStatus;
  createdAt: string;
  updatedAt: string;
};

export type ContentSummary = {
  id: string;
  slug: string;
  type: ContentType;
  title: string;
  subtitle: string | null;
  summary: string;
  coverMediaId: string | null;
  coverImageUrl: string | null;
  status: ContentStatus;
  publishedAt: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  storyProfile: RescueStoryProfile | null;
  latestPublicUpdate: StoryUpdate | null;
  createdAt: string;
  updatedAt: string;
};

export type ContentDetail = ContentSummary & {
  body: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  links: ContentLink[];
  media: ContentMedia[];
  updates: StoryUpdate[];
  socialCopies: SocialCopyVariant[];
  notificationDrafts: RecipientNotificationDraft[];
};

export type PublishValidationIssue = {
  field: string;
  message: string;
};

export type PublicStoryMapPoint = {
  id: string;
  slug: string;
  title: string;
  animalType: AnimalStoryType;
  publicStatus: RescuePublicStatus;
  rescueRegion: string;
  publicMapLabel: string;
  lat: number;
  lng: number;
  latestUpdateTitle: string | null;
};
