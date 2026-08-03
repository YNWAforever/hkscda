import type {
  ContentDetail,
  PublicStoryMapPoint,
  PublishValidationIssue,
  RescueStoryProfile,
} from "./types";

function blank(value: string | null | undefined) {
  return !value || value.trim().length === 0;
}

export function validateStoryMapVisibility(profile: RescueStoryProfile): PublishValidationIssue[] {
  if (!profile.showOnMap) return [];
  const issues: PublishValidationIssue[] = [];
  if (blank(profile.publicMapLabel)) {
    issues.push({
      field: "publicMapLabel",
      message: "Map label is required when showing this story on the map",
    });
  }
  if (profile.publicLat === null) {
    issues.push({
      field: "publicLat",
      message: "Approximate public latitude is required for map stories",
    });
  }
  if (profile.publicLng === null) {
    issues.push({
      field: "publicLng",
      message: "Approximate public longitude is required for map stories",
    });
  }
  return issues;
}

export function validatePublishableContent(content: ContentDetail): PublishValidationIssue[] {
  const issues: PublishValidationIssue[] = [];
  if (blank(content.title))
    issues.push({ field: "title", message: "Title is required before publishing" });
  if (blank(content.slug))
    issues.push({ field: "slug", message: "Slug is required before publishing" });
  if (blank(content.summary))
    issues.push({ field: "summary", message: "Summary is required before publishing" });
  if (blank(content.coverMediaId) && blank(content.coverImageUrl)) {
    issues.push({ field: "coverMediaId", message: "Cover image is required before publishing" });
  }
  if (blank(content.publishedAt)) {
    issues.push({ field: "publishedAt", message: "Published date is required before publishing" });
  }
  if (content.type === "rescue_story") {
    if (!content.storyProfile) {
      issues.push({
        field: "storyProfile",
        message: "Rescue stories need Story Wall settings before publishing",
      });
    } else {
      if (blank(content.storyProfile.rescueRegion)) {
        issues.push({
          field: "rescueRegion",
          message: "Rescue region is required before publishing",
        });
      }
      issues.push(...validateStoryMapVisibility(content.storyProfile));
    }
  }
  return issues;
}

export function buildPublicStoryMapPoint(content: ContentDetail): PublicStoryMapPoint | null {
  const profile = content.storyProfile;
  if (!profile?.showOnMap) return null;
  const publicMapLabel = profile.publicMapLabel;
  if (!publicMapLabel?.trim() || profile.publicLat === null || profile.publicLng === null)
    return null;
  return {
    id: content.id,
    slug: content.slug,
    title: content.title,
    animalType: profile.animalType,
    publicStatus: profile.publicStatus,
    rescueRegion: profile.rescueRegion,
    publicMapLabel,
    lat: profile.publicLat,
    lng: profile.publicLng,
    latestUpdateTitle: content.latestPublicUpdate?.title ?? null,
  };
}
