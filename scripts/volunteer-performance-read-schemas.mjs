import { z } from "zod";
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (value) =>
      !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value,
  );
const page = z.number().int().min(1).max(100000).default(1);
const filter = z
  .object({
    from: day.optional(),
    until: day.optional(),
    q: z.string().trim().max(150).optional(),
    shelter: z.string().max(80).optional(),
    template: z.string().max(80).optional(),
    status: z.enum(["", "draft", "published", "cancelled", "closed"]).optional(),
    scenario: z.enum(["", "confirmed_group", "no_confirmed_group", "none"]).optional(),
    readiness: z.enum(["", "ready", "missing"]).optional(),
    shortage: z.boolean().optional(),
    sort: z.enum(["asc", "desc"]).default("asc"),
  })
  .strict()
  .refine((v) => !v.from || !v.until || v.from <= v.until);
const list = z.object({ action: z.literal("list") }).strict();
// Deliberately narrow read subsets of the server schemas; writes never enter this registry.
export const volunteerReadSchemas = new Map([
  [
    "/api/admin/volunteers/bulk",
    z.discriminatedUnion("action", [
      z.object({ action: z.literal("list"), filter, page }).strict(),
      z.object({ action: z.literal("templates") }).strict(),
      z
        .object({
          action: z.literal("detail"),
          activity_id: z.string().uuid(),
          page,
          history_page: page,
        })
        .strict(),
    ]),
  ],
  [
    "/api/admin/volunteers/tasks",
    z
      .object({
        action: z.literal("list"),
        scope: z.enum(["upcoming", "overdue", "all"]).optional(),
        q: z.string().trim().max(100).optional(),
        page: page.optional(),
        pageSize: z.number().int().min(0).max(100).optional(),
      })
      .strict(),
  ],
  ...["settings", "sources", "daily-settings", "operations", "qualifications", "simulation"].map(
    (endpoint) => [`/api/admin/volunteers/${endpoint}`, list],
  ),
  ["/api/admin/volunteers/assessments", z.object({ kind: z.literal("list") }).strict()],
  [
    "/api/admin/volunteers/people",
    z
      .object({
        q: z.string().trim().max(200).default(""),
        status: z.enum(["pending", "active", "suspended"]).optional(),
        tier: z.enum(["newcomer", "regular", "senior"]).optional(),
        page: z.number().int().min(1).max(1000000).default(1),
        limit: z.number().int().min(1).max(50).default(25),
        profile_id: z.string().uuid().optional(),
      })
      .strict(),
  ],
  [
    "/api/admin/volunteers/group-enquiries",
    z
      .object({
        action: z.literal("search"),
        query: z
          .object({
            q: z.string().trim().max(200).optional(),
            status: z.enum(["new", "in_progress", "resolved", "closed"]).optional(),
            page: z.number().int().min(1).max(100000).default(1),
          })
          .strict(),
      })
      .strict(),
  ],
]);
