export const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DraftEnvelope<T> = {
  schemaVersion: 2;
  savedAt: string;
  expiresAt: string;
  step: number;
  data: T;
};

type DraftStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

export type DraftReadResult<T> =
  | { state: "none" | "expired" | "invalid" }
  | { state: "available"; draft: DraftEnvelope<T> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readDraft<T>(
  storage: DraftStorage,
  key: string,
  now = new Date(),
): DraftReadResult<T> {
  try {
    const raw = storage.getItem(key);
    if (raw === null) return { state: "none" };
    const value: unknown = JSON.parse(raw);
    if (!isRecord(value) || value.schemaVersion !== 2 || !isRecord(value.data)) {
      return { state: "invalid" };
    }
    const saved = typeof value.savedAt === "string" ? Date.parse(value.savedAt) : NaN;
    const expiry = typeof value.expiresAt === "string" ? Date.parse(value.expiresAt) : NaN;
    if (
      !Number.isFinite(saved) ||
      !Number.isFinite(expiry) ||
      expiry <= saved ||
      expiry - saved > DRAFT_TTL_MS ||
      !Number.isInteger(value.step) ||
      (value.step as number) < 0 ||
      (value.step as number) > 100
    ) {
      return { state: "invalid" };
    }
    if (expiry <= now.getTime()) {
      clearDraft(storage, key);
      return { state: "expired" };
    }
    return { state: "available", draft: value as DraftEnvelope<T> };
  } catch {
    return { state: "invalid" };
  }
}

export function writeDraft<T extends Record<string, unknown>>(
  storage: DraftStorage,
  key: string,
  data: T,
  step: number,
  now = new Date(),
): boolean {
  try {
    if (!Number.isInteger(step) || step < 0 || step > 100) return false;
    const draft: DraftEnvelope<T> = {
      schemaVersion: 2,
      savedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + DRAFT_TTL_MS).toISOString(),
      step,
      data,
    };
    storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearDraft(storage: DraftStorage, key: string): boolean {
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

/** Copy only form-owned scalar answers; never persist File, Blob, token or nested unknown data. */
export function pickDraftFields(
  value: unknown,
  fields: readonly string[],
): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const selected: Record<string, unknown> = {};
  for (const field of fields) {
    const item = value[field];
    if (
      typeof item === "string" ||
      typeof item === "boolean" ||
      (typeof item === "number" && Number.isFinite(item)) ||
      item === null ||
      (Array.isArray(item) && item.every((entry) => typeof entry === "string"))
    ) {
      selected[field] = item;
    }
  }
  return selected;
}
