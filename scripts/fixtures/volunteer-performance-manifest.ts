import type { VolunteerCleanupManifest } from "./volunteer-daily-work";
/** Counts come only from a successfully created fixture receipt; never manufacture a scale. */
export function volunteerPerformanceDataset(manifest: VolunteerCleanupManifest) {
  return {
    domain: "volunteers" as const,
    counts: {
      actors: manifest.actorIds.length,
      profiles: manifest.profileIds.length,
      activities: manifest.activityIds.length,
      registrations: manifest.registrationIds.length,
      notifications: manifest.outboxIds.length,
    },
  };
}
