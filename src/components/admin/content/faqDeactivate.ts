/** What the FAQ screen sends to disable an entry: the chosen entry's id with the dialog's reason. */
export function faqDeactivateRequest(
  id: string | null,
  reason: string | null,
): { id: string; reason: string } | null {
  if (id === null || reason === null || reason.trim() === "") return null;
  return { id, reason: reason.trim() };
}
