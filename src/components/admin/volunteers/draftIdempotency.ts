/**
 * Whether a failed draft save must take a new idempotency key before the next attempt. A 409
 * means the server already holds this key for different content (a lost response, then an
 * edited retry), so resending the same key can only conflict again (BUG-59).
 */
export function shouldRotateDraftKey(error: unknown): boolean {
  return (
    typeof error === "object" && error !== null && (error as { status?: unknown }).status === 409
  );
}
