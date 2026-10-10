import { z } from "zod";
import type { AdminLanguage } from "../../admin/language";
export const hkDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(
    (v) => !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v,
    "日期無效",
  );
export const activityFilterSchema = z
  .object({
    from: hkDateSchema.optional(),
    until: hkDateSchema.optional(),
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
  .refine((v) => !v.from || !v.until || v.from <= v.until, "結束日期須在開始日期之後");
const uuid = z.string().uuid();
const reason = z.string().trim().min(1).max(1000);
const dates = z
  .array(hkDateSchema)
  .min(1)
  .max(366)
  .refine((v) => new Set(v).size === v.length, "日期不可重複");
const key = z.string().regex(/^[a-z][a-z0-9_-]{0,79}$/);
const inputSchema = z.union([
  z.object({ template_keys: z.array(key).min(1).max(12), dates }).strict(),
  z.object({ source_id: uuid, template_key: key.optional(), dates }).strict(),
  z
    .object({
      changes: z
        .object({
          title: z.string().trim().min(1).max(150).optional(),
          description: z.string().max(10000).optional(),
        })
        .strict()
        .refine((v) => Object.keys(v).length > 0),
    })
    .strict(),
  z.object({ version_id: uuid, reason }).strict(),
  z.object({ reason }).strict(),
  z
    .object({
      attendance_status: z.enum(["attended", "completed", "no_show", "not_marked"]),
      command: z.enum(["record", "correct"]),
      reason: reason.optional(),
    })
    .strict()
    .refine((v) => v.command !== "correct" || Boolean(v.reason), "更正需要原因"),
]);
export const bulkCommandSchema = z.discriminatedUnion("action", [
  z
    .object({
      action: z.literal("list"),
      filter: activityFilterSchema,
      page: z.number().int().min(1).max(100000).default(1),
    })
    .strict(),
  z.object({ action: z.literal("templates") }).strict(),
  z
    .object({
      action: z.literal("detail"),
      history_page: z.number().int().min(1).max(100000).default(1),
      activity_id: uuid,
      page: z.number().int().min(1).max(100000).default(1),
    })
    .strict(),
  z
    .object({
      action: z.literal("select"),
      mode: z.enum(["page", "all"]),
      filter: activityFilterSchema,
      ids: z.array(uuid).max(5000).default([]),
      idempotency_key: uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("preview"),
      operation: z.enum(["generate", "copy", "edit", "rebind", "close", "cancel", "attendance"]),
      selection_id: uuid.optional(),
      input: inputSchema,
      idempotency_key: uuid,
    })
    .strict(),
  z
    .object({
      action: z.literal("apply"),
      operation_id: uuid,
      group_index: z.number().int().min(0).max(4999),
    })
    .strict(),
  z.object({ action: z.literal("status"), operation_id: uuid }).strict(),
]);
export type BulkCommand = z.infer<typeof bulkCommandSchema>;
export type ActivityFilter = z.infer<typeof activityFilterSchema>;
export function createBulkService(
  execute: (actor: string, command: BulkCommand) => Promise<unknown>,
) {
  return {
    command(actor: string, raw: unknown) {
      const command = bulkCommandSchema.parse(raw);
      if (command.action === "preview") {
        const input = command.input;
        const valid =
          command.operation === "generate"
            ? "template_keys" in input
            : command.operation === "copy"
              ? "source_id" in input
              : command.operation === "edit"
                ? "changes" in input
                : command.operation === "rebind"
                  ? "version_id" in input
                  : command.operation === "attendance"
                    ? "attendance_status" in input
                    : "reason" in input;
        if (!valid || (!["generate", "copy"].includes(command.operation) && !command.selection_id))
          throw new z.ZodError([{ code: "custom", path: ["input"], message: "操作與欄位不一致" }]);
      }
      return execute(actor, command);
    },
  };
}
export function hkDate(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}
export function addHkDays(date: string, days: number) {
  const value = new Date(date + "T12:00:00+08:00");
  value.setUTCDate(value.getUTCDate() + days);
  return hkDate(value);
}
/** Why `generationDates` refused its dates. */
export type BulkInputErrorCode = "invalid_date" | "range_too_long";

const BULK_INPUT_ERROR_TEXT: Record<BulkInputErrorCode, Record<AdminLanguage, string>> = {
  invalid_date: {
    zh: "日期無效",
    en: "Enter a valid date for both the start and the end, then preview again.",
  },
  range_too_long: {
    zh: "日期範圍須在一年內",
    en: "The date range must be within one year, and the end must not be before the start. Change the dates and preview again.",
  },
};

/** The message for a bulk input error code. Defaults to zh-HK. */
export function bulkInputErrorText(code: BulkInputErrorCode, language: AdminLanguage = "zh") {
  return BULK_INPUT_ERROR_TEXT[code][language];
}

/**
 * Thrown by `generationDates`. Its `message` is the zh-HK text, so code that shows it as it is keeps
 * working; a screen reads `code` and writes the message for the admin's language with
 * `bulkInputErrorText`.
 */
export class BulkInputError extends Error {
  constructor(readonly code: BulkInputErrorCode) {
    super(bulkInputErrorText(code));
    this.name = "BulkInputError";
  }
}

export function generationDates(
  from: string,
  until: string,
  weekdays: number[],
  exclusions: string[],
) {
  if (!hkDateSchema.safeParse(from).success || !hkDateSchema.safeParse(until).success)
    throw new BulkInputError("invalid_date");
  const result: string[] = [];
  if (until < from || Date.parse(until) - Date.parse(from) > 365 * 86400000)
    throw new BulkInputError("range_too_long");
  for (let date = from; date <= until; date = addHkDays(date, 1)) {
    if (
      weekdays.includes(new Date(date + "T12:00:00+08:00").getUTCDay()) &&
      !exclusions.includes(date)
    )
      result.push(date);
  }
  return result;
}
export const hkTimeLabel = (value: string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    month: "short",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
