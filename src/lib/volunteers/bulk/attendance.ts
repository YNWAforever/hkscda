import { z } from "zod";

export const attendanceStatuses = ["not_marked", "attended", "completed", "no_show"] as const;
export const attendanceReasons = [
  "unchanged",
  "registration_not_approved",
  "activity_cancelled",
  "future_attendance",
  "attendance_correction_required",
  "invalid_attendance_status",
  "stale_registration",
  "stale_activity",
  "registration_missing",
  "operation_expired",
  "transaction_failed",
] as const;
const uuid = z.string().uuid();
const timestamp = z.string().datetime({ offset: true });
const reason = z.enum(attendanceReasons).nullable();
export const attendanceTargetSchema = z
  .object({
    registration_id: uuid,
    expected_updated_at: timestamp,
    attendance_status: z.enum(attendanceStatuses),
    command: z.enum(["record", "correct"]),
    reason: z.string().trim().min(1).max(1000).optional(),
  })
  .strict()
  .refine(
    (value) => value.command !== "correct" || Boolean(value.reason),
    "Correction reason required",
  );
export const attendancePreviewCommandSchema = z
  .object({
    action: z.literal("attendance_preview"),
    activity_id: uuid,
    expected_activity_updated_at: timestamp,
    page: z.number().int().min(1).max(100000),
    page_size: z.literal(25),
    entries: z.array(attendanceTargetSchema).min(1).max(25),
    idempotency_key: uuid,
  })
  .strict()
  .refine(
    (value) =>
      new Set(value.entries.map((entry) => entry.registration_id)).size === value.entries.length,
    "Duplicate registration",
  );
export const attendanceApplyCommandSchema = z
  .object({ action: z.literal("attendance_apply"), operation_id: uuid })
  .strict();
export const attendanceLookupCommandSchema = z
  .object({ action: z.literal("attendance_lookup"), idempotency_key: uuid })
  .strict();
export const attendanceCommandSchema = z.union([
  attendancePreviewCommandSchema,
  attendanceApplyCommandSchema,
  attendanceLookupCommandSchema,
]);
export type AttendanceTarget = z.infer<typeof attendanceTargetSchema>;
export type AttendancePreviewCommand = z.infer<typeof attendancePreviewCommandSchema>;
export type AttendanceApplyCommand = z.infer<typeof attendanceApplyCommandSchema>;
export type AttendanceLookupCommand = z.infer<typeof attendanceLookupCommandSchema>;
export type AttendanceCommand =
  | z.infer<typeof attendanceCommandSchema>
  | { action: "status"; operation_id: string };
export function normalizeAttendancePreviewCommand(raw: unknown): AttendancePreviewCommand {
  const command = attendancePreviewCommandSchema.parse(raw);
  return {
    ...command,
    entries: [...command.entries].sort((a, b) =>
      a.registration_id.localeCompare(b.registration_id),
    ),
  };
}
export const attendanceFactSchema = z
  .object({
    registration_status: z.string().min(1).max(40),
    attendance_status: z.enum(attendanceStatuses),
    updated_at: timestamp,
  })
  .strict();
const previewRowSchema = z
  .object({
    registration_id: uuid,
    contact_name: z.string(),
    participant_count: z.number().int().positive(),
    before: attendanceFactSchema,
    target: attendanceTargetSchema,
    decision: z.enum(["ready", "skipped", "conflicted"]),
    reason,
  })
  .strict()
  .refine((row) => row.registration_id === row.target.registration_id, "Target identity differs");
const itemResultSchema = z
  .object({
    registration_id: uuid,
    kind: z.enum(["applied", "skipped", "conflicted", "failed"]),
    reason,
    before: attendanceFactSchema,
    current: attendanceFactSchema.nullable(),
    after: attendanceFactSchema.nullable(),
    event_id: uuid.nullable(),
    audit_id: z.string().min(1).nullable(),
  })
  .strict()
  .superRefine((row, ctx) => {
    if (
      row.kind === "applied" &&
      (!row.after || !row.event_id || !row.audit_id || row.reason !== null)
    )
      ctx.addIssue({ code: "custom", message: "Applied outcome requires its atomic receipt" });
    if (
      row.kind !== "applied" &&
      (row.after !== null || row.event_id !== null || row.reason === null || row.audit_id === null)
    )
      ctx.addIssue({
        code: "custom",
        message: "Non-applied outcome requires a reason and attempt receipt",
      });
  });
export const rosterAttendanceOperationSchema = z
  .object({
    id: uuid,
    action: z.literal("roster_attendance"),
    created_at: timestamp,
    expires_at: timestamp,
    activity_id: uuid,
    activity_title: z.string(),
    scope: z
      .object({
        kind: z.literal("page"),
        page: z.number().int().min(1).max(100000),
        page_size: z.literal(25),
        selected_count: z.number().int().min(1).max(25),
      })
      .strict(),
    state: z.enum(["previewed", "completed", "expired"]),
    rows: z.array(previewRowSchema).min(1).max(25),
    results: z.array(itemResultSchema).max(25).nullable(),
    notifications: z.array(z.never()).max(0),
  })
  .strict()
  .superRefine((op, ctx) => {
    const ids = new Set(op.rows.map((row) => row.registration_id));
    if (ids.size !== op.rows.length || op.scope.selected_count !== op.rows.length)
      ctx.addIssue({ code: "custom", message: "Selected identities differ" });
    if (op.state === "completed") {
      if (
        !op.results ||
        op.results.length !== ids.size ||
        new Set(op.results.map((row) => row.registration_id)).size !== ids.size ||
        op.results.some((row, index) => row.registration_id !== op.rows[index]?.registration_id)
      )
        ctx.addIssue({
          code: "custom",
          message: "Every selected person requires exactly one ordered outcome",
        });
      if (
        op.results?.some(
          (row, index) =>
            row.kind === "applied" &&
            row.after?.attendance_status !== op.rows[index]?.target.attendance_status,
        )
      )
        ctx.addIssue({ code: "custom", message: "Applied outcome differs from reviewed target" });
    } else if (op.results !== null)
      ctx.addIssue({ code: "custom", message: "Uncompleted operation cannot claim results" });
  });
export type AttendanceFact = z.infer<typeof attendanceFactSchema>;
export type AttendancePreviewRow = z.infer<typeof previewRowSchema>;
export type AttendanceItemResult = z.infer<typeof itemResultSchema>;
export type RosterAttendanceOperation = z.infer<typeof rosterAttendanceOperationSchema>;
export type AttendanceActionCapability = {
  command: "record" | "correct";
  attendance_status: AttendanceTarget["attendance_status"];
  allowed: boolean;
  reason: (typeof attendanceReasons)[number] | null;
  requires_reason: boolean;
};
export function parseRosterAttendanceReply(raw: unknown): RosterAttendanceOperation {
  return z
    .object({ kind: z.literal("ready"), operation: rosterAttendanceOperationSchema })
    .strict()
    .parse(raw).operation;
}
