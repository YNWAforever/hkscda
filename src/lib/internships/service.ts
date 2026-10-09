import { z } from "zod";
import type { AdminLanguage } from "../admin/language";

/**
 * The reasons the intake settings form is refused in the browser (`intakeSchema` is parsed
 * there before saving), and the messages the internship API sends as text. Each has one
 * message in each language. The API (`http.server.ts`) keeps sending the zh-HK text, so
 * the admin screen finds the code with `internshipErrorCode` and writes the message for the
 * admin's language; a message it does not know is shown as sent.
 */
export type IntakeIssueCode =
  | "name_required"
  | "shelter_required"
  | "closes_before_opens"
  | "invalid_intake";
export type InternshipServerErrorCode =
  | "invalid_request"
  | "forbidden"
  | "state_conflict"
  | "unexpected";
export type InternshipErrorCode = IntakeIssueCode | InternshipServerErrorCode;

const INTERNSHIP_ERROR_TEXT: Record<InternshipErrorCode, Record<AdminLanguage, string>> = {
  name_required: {
    zh: "請填寫標題",
    en: "Enter a title, then save again.",
  },
  shelter_required: {
    zh: "請至少選擇一個服務場地",
    en: "Choose at least one venue, then save again.",
  },
  closes_before_opens: {
    zh: "截止時間必須晚於開放時間",
    en: "The closing time must be after the opening time. Change one of them and save again.",
  },
  invalid_intake: {
    zh: "請檢查收生設定欄位",
    en: "Check the intake settings fields, then save again.",
  },
  invalid_request: {
    zh: "請檢查實習申請欄位",
    en: "Check the internship application fields and try again.",
  },
  forbidden: {
    zh: "沒有此操作權限",
    en: "You do not have permission to do this. Ask an administrator to check your role.",
  },
  state_conflict: {
    zh: "操作不符合目前申請狀態或核實要求",
    en: "This action does not fit the application's current status or verification. Refresh the page and check the application.",
  },
  unexpected: {
    zh: "未能處理，請重新整理後再試",
    en: "Could not process the request. Refresh the page and try again.",
  },
};

/** The message for an internship error code. Defaults to zh-HK, the text the API sends. */
export function internshipErrorText(
  code: InternshipErrorCode,
  language: AdminLanguage = "zh",
): string {
  return INTERNSHIP_ERROR_TEXT[code][language];
}

const SERVER_ERROR_CODES: readonly InternshipServerErrorCode[] = [
  "invalid_request",
  "forbidden",
  "state_conflict",
  "unexpected",
];

/** Which reason in a failed `intakeSchema` parse to tell staff about: the first one. */
function intakeIssueCode(error: z.ZodError): IntakeIssueCode {
  const issue = error.issues[0];
  if (!issue) return "invalid_intake";
  if (issue.code === "custom" && issue.params?.code === "closes_before_opens")
    return "closes_before_opens";
  if (issue.code === "too_small" && issue.path[0] === "name") return "name_required";
  if (issue.code === "too_small" && issue.path[0] === "shelters") return "shelter_required";
  return "invalid_intake";
}

/**
 * The code for an error the internship screens can write in either language: a failed
 * `intakeSchema` parse, or one of the API's fixed messages. `null` for anything else, which
 * the screen shows as it came.
 */
export function internshipErrorCode(error: unknown): InternshipErrorCode | null {
  if (error instanceof z.ZodError) return intakeIssueCode(error);
  if (error instanceof Error)
    return (
      SERVER_ERROR_CODES.find((code) => INTERNSHIP_ERROR_TEXT[code].zh === error.message) ?? null
    );
  return null;
}

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
  .refine((v) => !v.opens_at || !v.closes_at || Date.parse(v.opens_at) < Date.parse(v.closes_at), {
    message: internshipErrorText("closes_before_opens"),
    params: { code: "closes_before_opens" },
  });
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
