export interface LegacyProfileOption {
  id: string;
  display_name: string;
  status: string;
}

/**
 * The profile a legacy link may use: the one chosen, but only while it is still offered and
 * active. The qualifications page offers just the volunteer picked in its search, so a choice
 * made for an earlier volunteer must never be sent (a legacy identity link is permanent).
 */
export function offeredLegacyProfileId(chosenId: string, profiles: LegacyProfileOption[]) {
  return profiles.some((p) => p.id === chosenId && p.status === "active") ? chosenId : "";
}
