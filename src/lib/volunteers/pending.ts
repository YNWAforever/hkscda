import { z } from "zod";
export const pendingQuerySchema = z
  .object({
    scope: z.enum(["upcoming", "overdue", "all"]).default("all"),
    page: z.number().int().min(1).max(100000).default(1),
    pageSize: z.number().int().min(0).max(100).default(25),
  })
  .strict();
export type PendingScope = z.infer<typeof pendingQuerySchema>["scope"];
export type PendingCounts = { upcoming: number; overdue: number; total: number; asOf: string };
const counts = z
  .object({
    upcoming: z.number().int().nonnegative(),
    overdue: z.number().int().nonnegative(),
    total: z.number().int().nonnegative(),
    asOf: z.string().datetime({ offset: true }),
  })
  .refine((v) => v.total === v.upcoming + v.overdue);
const workFields = z.object({
  profile_id: z.string().uuid().nullable(),
  participant_count: z.number().int().positive(),
  status: z.literal("pending"),
  ends_at: z.string().nullable(),
  location: z.string(),
  capacity: z.number().int().nonnegative(),
  approved_participants: z.number().int().nonnegative(),
  remaining_capacity: z.number().int().nonnegative(),
});
const registrationFields = z.object({
  id: z.string().uuid(),
  activity_id: z.string().uuid(),
  contact_name: z.string(),
  title: z.string(),
  starts_at: z.string(),
});
export const pendingSnapshotSchema = z.object({
  counts,
  registrations: z.array(registrationFields.merge(workFields.partial())),
  page: z.number().int().positive(),
  pageSize: z.number().int().min(0).max(100),
});
export const pendingWorkQuerySchema = pendingQuerySchema.extend({
  q: z.string().trim().max(100).default(""),
});
export const pendingWorkSnapshotSchema = pendingSnapshotSchema.extend({
  registrations: z.array(registrationFields.merge(workFields)),
  filteredTotal: z.number().int().nonnegative(),
});
export type PendingWorkSnapshot = z.infer<typeof pendingWorkSnapshotSchema>;
export type PendingWorkRpcArgs = {
  p_actor: string;
  p_scope: PendingScope;
  p_page: number;
  p_page_size: number;
  p_as_of: string;
  p_query: string;
};
export async function readPendingWorkSnapshot(
  execute: (args: PendingWorkRpcArgs) => Promise<unknown>,
  actor: string,
  raw: unknown,
  now = () => new Date(),
): Promise<PendingWorkSnapshot> {
  const query = pendingWorkQuerySchema.parse(raw);
  const response = pendingWorkSnapshotSchema.safeParse(
    await execute({
      p_actor: actor,
      p_scope: query.scope,
      p_page: query.page,
      p_page_size: query.pageSize,
      p_as_of: now().toISOString(),
      p_query: query.q,
    }),
  );
  if (!response.success) throw new Error("Invalid pending work snapshot");
  return response.data;
}
export async function readPendingSnapshot(
  execute: (args: {
    p_actor: string;
    p_scope: PendingScope;
    p_page: number;
    p_page_size: number;
    p_as_of: string;
  }) => Promise<unknown>,
  actor: string,
  raw: unknown,
  now = () => new Date(),
) {
  const query = pendingQuerySchema.parse(raw);
  const data = await execute({
    p_actor: actor,
    p_scope: query.scope,
    p_page: query.page,
    p_page_size: query.pageSize,
    p_as_of: now().toISOString(),
  });
  return pendingSnapshotSchema.parse(data);
}
