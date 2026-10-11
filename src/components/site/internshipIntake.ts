import type { IntakeBody } from "./InternshipForm";

export type InternshipIntake = { version: string; settings: IntakeBody };

/**
 * The intake arrives over the network. Anything that is not the expected shape
 * (an error body from a failed request, an empty RPC result) is rejected here,
 * so the form shows its own load error instead of throwing during render and
 * taking the whole page down to the root error screen.
 */
export function parseInternshipIntake(data: unknown): InternshipIntake | null {
  if (!data || typeof data !== "object") return null;
  const { version, settings } = data as { version?: unknown; settings?: unknown };
  if (typeof version !== "string" || !settings || typeof settings !== "object") return null;
  const body = settings as Partial<Record<keyof IntakeBody, unknown>>;
  if (typeof body.enabled !== "boolean" || typeof body.name !== "string") return null;
  if (!Array.isArray(body.shelters) || !body.shelters.every((s) => typeof s === "string"))
    return null;
  return {
    version,
    settings: {
      enabled: body.enabled,
      name: body.name,
      shelters: body.shelters,
      opens_at: typeof body.opens_at === "string" ? body.opens_at : null,
      closes_at: typeof body.closes_at === "string" ? body.closes_at : null,
      instructions: typeof body.instructions === "string" ? body.instructions : "",
    },
  };
}
