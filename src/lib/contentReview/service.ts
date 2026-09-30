import { z } from "zod";
export const reviewSchema = z
  .object({
    entity_kind: z.enum(["animal", "content"]),
    entity_id: z.string().uuid(),
    revision_key: z.string().min(1).max(100),
    classification: z.enum(["approved", "demo", "needs_review"]),
    evidence: z.string().trim().min(1).max(2000),
  })
  .strict();
export const reviewSearchSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    kind: z.enum(["animal", "content"]).default("content"),
    quality: z.enum(["all", "demo", "expired", "missing_source"]).default("all"),
  })
  .refine((input) => input.kind === "content" || input.quality === "all", {
    message: "Quality filters apply to CMS content only",
  });
export type ReviewInput = z.infer<typeof reviewSchema>;
export type ReviewSearch = z.infer<typeof reviewSearchSchema>;
export type ReviewQueueRow = {
  entity_kind: "animal" | "content";
  entity_id: string;
  revision_key: string | null;
  title: string;
  publication_state: string;
  classification: ReviewInput["classification"];
  evidence: string | null;
  quality_reason?: Exclude<ReviewSearch["quality"], "all">;
  effective_until?: string | null;
};
export function createContentReviewService(repo: {
  review(actor: string, input: ReviewInput): Promise<{ kind: string }>;
  list(actor: string, input: ReviewSearch): Promise<{ items: ReviewQueueRow[]; total: number }>;
}) {
  return {
    review: (actor: string, raw: unknown) => repo.review(actor, reviewSchema.parse(raw)),
    list: (actor: string, raw: unknown) => repo.list(actor, reviewSearchSchema.parse(raw)),
  };
}
