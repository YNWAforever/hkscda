// src/lib/governance/schemas.ts
import { z } from "zod";

const requiredText = (max: number) => z.string().trim().min(1).max(max);

export const boardMemberIdSchema = z.string().uuid();

export const boardMemberInputSchema = z.object({
  id: z.string().uuid().optional(),
  name: requiredText(120),
  roleTitle: requiredText(120),
  sortOrder: z.coerce.number().int().min(0).default(0),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "effectiveDate must be YYYY-MM-DD"),
});

export const deactivateBoardMemberSchema = z.object({ id: boardMemberIdSchema });

export type BoardMemberInput = z.infer<typeof boardMemberInputSchema>;
