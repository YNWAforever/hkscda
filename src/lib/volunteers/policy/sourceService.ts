import { z } from "zod";
import { policyDraftSchema } from "./schemas";
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
export const sourceCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list") }).strict(),
  z.object({ action: z.literal("resolve"), body: policyDraftSchema }).strict(),
  z
    .object({
      action: z.literal("registry_save"),
      kind: z.enum(["shelter", "credential"]),
      key,
      label: z.string().trim().min(1).max(150),
      timezone: z.string().max(100).optional(),
      location: z.string().max(200).optional(),
      expected_revision: z.number().int().nonnegative(),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
  z
    .object({
      action: z.literal("preview_source"),
      scope_key: key,
      template_key: key,
      draft_revision: z.number().int().positive(),
      expected_revision: z.number().int().nonnegative(),
    })
    .strict(),
  z
    .object({
      action: z.literal("publish_source"),
      preview_id: z.string().uuid(),
      idempotency_key: z.string().uuid(),
      reason: z.string().trim().min(1).max(1000),
    })
    .strict(),
]);
export type SourceCommand = z.infer<typeof sourceCommandSchema>;
export type SourceListing = {
  shelters: { key: string; label: string; timezone: string; location: string; revision: number }[];
  credentials: { key: string; label: string; revision: number }[];
  sources: { scope_key: string; revision: number; current_version_id: string }[];
  drafts: { template_key: string; name: string; revision: number }[];
};
