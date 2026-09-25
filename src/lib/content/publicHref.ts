const ROOT_RELATIVE_ORIGIN = "https://public-href.invalid";

export function isSafePublicHref(value: string | null | undefined) {
  const next = value?.trim();
  if (!next) return false;

  try {
    if (next.startsWith("/")) {
      return new URL(next, ROOT_RELATIVE_ORIGIN).origin === ROOT_RELATIVE_ORIGIN;
    }

    const url = new URL(next);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}
