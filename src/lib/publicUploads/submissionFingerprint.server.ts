import { createHmac } from "node:crypto";

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, entry]) => entry !== undefined)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([key, entry]) => [key, canonical(entry)]),
    );
  }
  return value;
}

/** Bind a retry to the accepted form and uploaded references, excluding the one-use challenge. */
export function submissionFingerprint(
  kind: "adoption_application" | "sponsorship_pledge",
  payload: Record<string, unknown>,
  uploads: unknown,
  statusToken: string,
): string {
  const { turnstileToken: _challenge, ...submission } = payload;
  return createHmac("sha256", statusToken)
    .update(JSON.stringify(canonical({ version: 1, kind, submission, uploads })))
    .digest("hex");
}
