export const ADOPTION_DRAFT_STORAGE_KEY = "hkscda-adoption-application-draft-v1";

function stripFiles(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.filter((item) => !(item instanceof File)).map(stripFiles);
  }
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([key, item]) => key !== "photos" && !(item instanceof File))
        .map(([key, item]) => [key, stripFiles(item)]),
    );
  }
  return value;
}

export function serializeDraft(value: unknown) {
  return JSON.stringify(stripFiles(value));
}

export function parseDraft(value: string | null): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}
