import { z } from "zod";
const dateTime = z.string().datetime({ offset: true }).nullable();
export const intakeSchema = z
  .object({
    enabled: z.boolean(),
    name: z.string().trim().min(1).max(150),
    shelters: z
      .array(z.enum(["cat", "dog"]))
      .min(1)
      .max(2),
    opens_at: dateTime,
    closes_at: dateTime,
    instructions: z.string().max(3000),
  })
  .strict()
  .refine(
    (v) => !v.opens_at || !v.closes_at || Date.parse(v.opens_at) < Date.parse(v.closes_at),
    "截止時間必須晚於開放時間",
  );
const key = { idempotency_key: z.string().uuid() },
  application = {
    application_id: z.string().uuid(),
    expected_revision: z.number().int().positive(),
    ...key,
  };
export const publicCommandSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("mine") }).strict(),
  z
    .object({
      action: z.literal("submit"),
      intake_version_id: z.string().uuid(),
      name: z.string().trim().min(1).max(120),
      phone: z.string().trim().max(40),
      veterinary_student: z.boolean(),
      institution: z.string().trim().min(1).max(200),
      course: z.string().trim().min(1).max(200),
      shelter: z.enum(["cat", "dog"]),
      statement: z.string().trim().max(3000),
      ...key,
    })
    .strict(),
  z.object({ action: z.literal("withdraw"), ...application }).strict(),
  z
    .object({
      action: z.literal("supplement"),
      statement: z.string().trim().min(1).max(3000),
      ...application,
    })
    .strict(),
]);
export const adminCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(50).default(25),
      q: z.string().trim().max(200).optional(),
      status: z
        .enum(["submitted", "needs_information", "approved", "rejected", "withdrawn"])
        .optional(),
    })
    .strict(),
  z.object({ action: z.literal("detail"), application_id: z.string().uuid() }).strict(),
  z.object({ action: z.literal("settings") }).strict(),
  z
    .object({
      action: z.literal("save_intake"),
      expected_revision: z.number().int().positive(),
      body: intakeSchema,
    })
    .strict(),
  z
    .object({ action: z.literal("preview_intake"), expected_revision: z.number().int().positive() })
    .strict(),
  z
    .object({
      action: z.literal("publish_intake"),
      preview_id: z.string().uuid(),
      reason: z.string().trim().min(1).max(1000),
      ...key,
    })
    .strict(),
  z
    .object({
      action: z.literal("review"),
      ...application,
      status: z.enum(["approved", "rejected", "needs_information"]),
      reason: z.string().trim().min(1).max(2000),
      student_verified: z.boolean(),
      evidence: z.string().trim().max(2000),
    })
    .strict(),
]);
export type InternshipResult = { kind: string; reason?: string; [key: string]: unknown };
export type InternshipRepository = {
  command(actor: string | null, command: object): Promise<InternshipResult>;
};
export function createInternshipService(repo: InternshipRepository) {
  return {
    intake: () => repo.command(null, { action: "intake" }),
    publicCommand: (actor: string, raw: unknown) =>
      repo.command(actor, publicCommandSchema.parse(raw)),
    adminCommand: (actor: string, raw: unknown) =>
      repo.command(actor, adminCommandSchema.parse(raw)),
  };
}
