export type PublicAdoptionProgress = "received" | "in_progress" | "closed" | "completed";

export function publicAdoptionProgress(
  workflow: {
    statusKey: string;
    isClosing: boolean;
    closedAt: string | null;
    hasSuccessfulAdoption: boolean;
  } | null,
): PublicAdoptionProgress {
  if (!workflow) return "received";
  // A staff approval alone is not evidence that adoption was finalized.
  if (workflow.hasSuccessfulAdoption) return "completed";
  if (workflow.isClosing || workflow.closedAt) return "closed";
  return workflow.statusKey === "new" ? "received" : "in_progress";
}
