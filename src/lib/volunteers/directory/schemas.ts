import { z } from "zod";
export const directoryQuerySchema = z
  .object({
    q: z.string().trim().max(200).default(""),
    status: z.enum(["pending", "active", "suspended"]).optional(),
    tier: z.enum(["newcomer", "regular", "senior"]).optional(),
    page: z.coerce.number().int().min(1).max(1000000).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(25),
    profile_id: z.string().uuid().optional(),
  })
  .strict();
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
