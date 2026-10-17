export function canHydrateVolunteerDraft({
  dirty,
  identityChanged,
  loadedRevision,
  incomingRevision,
}: {
  dirty: boolean;
  identityChanged: boolean;
  loadedRevision: number;
  incomingRevision: number;
}): boolean {
  return identityChanged || (!dirty && incomingRevision > loadedRevision);
}
