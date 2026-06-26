import type { CoordinatorStatus } from "./types";

export function normalizeStatusKey(value: string) {
  const key = value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return /^[a-z][a-z0-9_]*$/.test(key) ? key : "";
}

export function assertCanMutateStatus(
  current: CoordinatorStatus,
  change: {
    delete?: boolean;
    nextCategory?: CoordinatorStatus["category"] | string;
    nextKey?: string;
    nextLabelZh?: string;
    nextLabelEn?: string;
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
}
