export type ReviewItem = {
  state: string;
  preview: { kind: string; registrations?: unknown[] };
};
export type ReviewGroup = {
  index: number;
  state: string;
  items: ReviewItem[];
};
export type ReviewOperation = {
  id: string;
  action: string;
  groups: ReviewGroup[];
};

export function reviewBulkOperation(operation: ReviewOperation) {
  const items = operation.groups.flatMap((group) => group.items);
  const eligible = operation.groups
    .filter((group) => group.state === "pending")
    .flatMap((group) => group.items)
    .filter((item) => item.state === "ready").length;
  const skipped = items.filter((item) => item.state === "skipped").length;
  const conflicted = operation.groups.reduce(
    (total, group) =>
      total +
      Math.max(
        group.items.filter((item) => item.state === "conflicted").length,
        group.state === "conflicted" ? 1 : 0,
      ),
    0,
  );
  const failed = operation.groups.reduce(
    (total, group) =>
      total +
      Math.max(
        group.items.filter((item) => item.state === "failed").length,
        group.state === "failed" ? 1 : 0,
      ),
    0,
  );
  const canRunSequentially =
    operation.action === "generate" &&
    operation.groups.some((group) => group.state === "pending") &&
    operation.groups.every(
      (group) =>
        group.state === "applied" ||
        (group.state === "pending" &&
          group.items.length > 0 &&
          group.items.every(
            (item) =>
              item.state === "ready" &&
              item.preview.kind === "generated" &&
              !item.preview.registrations?.length,
          )),
    );
  return { eligible, skipped, conflicted, failed, canRunSequentially };
}

/** One reviewed operation, one existing server transaction per group. */
export async function applyReviewedGroups<T extends ReviewOperation>(
  operation: T,
  apply: (operationId: string, groupIndex: number) => Promise<T>,
  refresh: (operationId: string) => Promise<T>,
): Promise<{ operation: T; halted: string | null }> {
  if (!reviewBulkOperation(operation).canRunSequentially)
    throw new RangeError("Only reviewed, ready draft generation can run sequentially");
  let current = operation;
  for (const { index } of operation.groups) {
    if (current.groups.find((group) => group.index === index)?.state === "applied") continue;
    if (!reviewBulkOperation(current).canRunSequentially)
      return { operation: current, halted: "review_required" };
    try {
      current = await apply(operation.id, index);
    } catch {
      return { operation: await refresh(operation.id), halted: "transport" };
    }
    const state = current.groups.find((group) => group.index === index)?.state;
    if (state !== "applied") return { operation: current, halted: state ?? "unknown" };
  }
  return { operation: current, halted: null };
}
