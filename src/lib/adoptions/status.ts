import type { CoordinatorStatus } from "./types";

export function normalizeStatusKey(value: string) {
  const key = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  return /^[a-z][a-z0-9_]*$/.test(key) ? key : "";
}

/**
 * A system status is identified by its key and category, and the seeded rows are load-bearing:
 * the adoption lifecycle reads their flags, not just their key. So its semantic flags are part
 * of that identity too. Turning `active` off on the system match status `approved`, or
 * `closing` off on `rejected`, silently blocks finalisation or leaves a rejected case open
 * (OPS-02), so those flags may not change on a system row. Labels, colour and sort order stay
 * editable.
 */
export function assertCanMutateStatus(
  current: CoordinatorStatus,
  change: {
    delete?: boolean;
    nextCategory?: CoordinatorStatus["category"] | string;
    nextKey?: string;
    nextLabelZh?: string;
    nextLabelEn?: string;
    nextIsActive?: boolean;
    nextIsClosing?: boolean;
    nextIsFinal?: boolean;
  },
) {
  if (current.isSystem && change.delete) {
    throw new Error("System statuses cannot be deleted");
  }
  if (current.isSystem && change.nextKey !== undefined && change.nextKey !== current.key) {
    throw new Error("System status keys cannot be changed");
  }
  if (
    current.isSystem &&
    change.nextCategory !== undefined &&
    change.nextCategory !== current.category
  ) {
    throw new Error("System status categories cannot be changed");
  }
  if (
    current.isSystem &&
    ((change.nextIsActive !== undefined && change.nextIsActive !== current.isActive) ||
      (change.nextIsClosing !== undefined && change.nextIsClosing !== current.isClosing) ||
      (change.nextIsFinal !== undefined && change.nextIsFinal !== current.isFinal))
  ) {
    throw new Error("System status flags cannot be changed");
  }
}
