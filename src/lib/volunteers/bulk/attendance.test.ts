import { expect, test } from "bun:test";
import {
  attendancePreviewCommandSchema,
  normalizeAttendancePreviewCommand,
  parseRosterAttendanceReply,
} from "./attendance";
const id = "90000000-0000-4000-8000-000000000001";
const session = "90000000-0000-4000-8000-000000000002";
const stamp = "2026-10-16T00:00:00.123456+00:00";
const target = {
  registration_id: id,
  expected_updated_at: stamp,
  attendance_status: "attended",
  command: "record",
};
const command = () => ({
  action: "attendance_preview",
  activity_id: session,
  expected_activity_updated_at: stamp,
  page: 1,
  page_size: 25,
  entries: [target],
  idempotency_key: session,
});
test("scoped preview preserves reviewed microsecond timestamps and requires unique bounded explicit IDs", () => {
  const parsed = attendancePreviewCommandSchema.parse(command());
  expect(parsed.entries[0].expected_updated_at).toBe(stamp);
  for (const entries of [
    [],
    [target, target],
    Array.from({ length: 26 }, () => ({ ...target, registration_id: crypto.randomUUID() })),
  ])
    expect(attendancePreviewCommandSchema.safeParse({ ...command(), entries }).success).toBe(false);
  expect(attendancePreviewCommandSchema.safeParse({ ...command(), mode: "all" }).success).toBe(
    false,
  );
  expect(
    attendancePreviewCommandSchema.safeParse({
      ...command(),
      entries: [{ ...target, expected_updated_at: undefined }],
    }).success,
  ).toBe(false);
});
test("every factual correction requires a bounded nonblank reason", () => {
  for (const reason of [undefined, " ", "x".repeat(1001)])
    expect(
      attendancePreviewCommandSchema.safeParse({
        ...command(),
        entries: [{ ...target, command: "correct", reason }],
      }).success,
    ).toBe(false);
  expect(
    attendancePreviewCommandSchema.parse({
      ...command(),
      entries: [{ ...target, command: "correct", reason: "  colleague correction  " }],
    }).entries[0].reason,
  ).toBe("colleague correction");
});
test("normalization fixes ID order and whitespace without changing reviewed versions", () => {
  const second = { ...target, registration_id: session, command: "correct", reason: " reason " };
  const first = normalizeAttendancePreviewCommand({ ...command(), entries: [second, target] });
  const other = normalizeAttendancePreviewCommand({
    ...command(),
    entries: [target, { ...second, reason: "reason" }],
  });
  expect(JSON.stringify(first)).toBe(JSON.stringify(other));
  expect(first.entries[0].expected_updated_at).toBe(stamp);
});
function reply() {
  return {
    kind: "ready",
    operation: {
      id: session,
      action: "roster_attendance",
      created_at: stamp,
      expires_at: "2026-10-16T00:30:00Z",
      activity_id: session,
      activity_title: "Synthetic session",
      scope: { kind: "page", page: 1, page_size: 25, selected_count: 1 },
      state: "previewed",
      rows: [
        {
          registration_id: id,
          contact_name: "Synthetic",
          participant_count: 1,
          before: {
            registration_status: "approved",
            attendance_status: "not_marked",
            updated_at: stamp,
          },
          target,
          decision: "ready",
          reason: null,
        },
      ],
      results: null,
      notifications: [],
    },
  };
}
test("an operation without complete per-person receipts cannot masquerade as success", () => {
  expect(parseRosterAttendanceReply(reply()).state).toBe("previewed");
  expect(() =>
    parseRosterAttendanceReply({
      ...reply(),
      operation: { ...reply().operation, state: "completed", results: [] },
    }),
  ).toThrow();
  const result = {
    registration_id: id,
    kind: "applied",
    reason: null,
    before: reply().operation.rows[0].before,
    current: reply().operation.rows[0].before,
    after: {
      registration_status: "approved",
      attendance_status: "attended",
      updated_at: "2026-10-16T00:00:00.123457Z",
    },
    event_id: id,
    audit_id: session,
  };
  const applied = {
    ...reply(),
    operation: { ...reply().operation, state: "completed", results: [result] },
  };
  expect(parseRosterAttendanceReply(applied).results?.[0].kind).toBe("applied");
  expect(() =>
    parseRosterAttendanceReply({
      ...applied,
      operation: { ...applied.operation, results: [{ ...result, event_id: null }] },
    }),
  ).toThrow();
  expect(() =>
    parseRosterAttendanceReply({
      ...applied,
      operation: { ...applied.operation, results: [result, result] },
    }),
  ).toThrow();
  expect(() =>
    parseRosterAttendanceReply({
      ...applied,
      operation: { ...applied.operation, results: [{ ...result, registration_id: session }] },
    }),
  ).toThrow();
  expect(() =>
    parseRosterAttendanceReply({
      ...applied,
      operation: {
        ...applied.operation,
        results: [{ ...result, after: { ...result.after, attendance_status: "no_show" } }],
      },
    }),
  ).toThrow();
});
