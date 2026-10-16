import { expect, test } from "bun:test";
import { renderAdminInEnglish } from "../i18n/testing";
import { ActivityDetailBody } from "./ActivityDetailSheet";
import { ActivityAttendanceRecovery } from "./ActivityAttendanceRecovery";
import { createAttendanceController } from "../../../lib/volunteers/bulk/attendanceRecovery";
import type { RosterAttendanceOperation } from "../../../lib/volunteers/bulk/attendance";

test("failed roster reload keeps the independent receipt and recovery controls inside the detail body", () => {
  const html = renderAdminInEnglish(
    <ActivityDetailBody
      detail={{
        isPending: false,
        isError: true,
        error: new Error("Synthetic read failure"),
        data: undefined,
        refetch: () => {},
      }}
      detailPage={1}
      historyPage={1}
      onDetailPage={() => {}}
      onHistoryPage={() => {}}
      onEdit={() => {}}
      attendance={<p>Stale editable roster</p>}
      attendanceRecovery={
        <section aria-label="Saved receipt">
          Saved, but reloading failed. <button>Reload roster only</button>
        </section>
      }
    />,
  );
  expect(html).toContain("Saved receipt");
  expect(html).toContain("Saved, but reloading failed.");
  expect(html).toContain("Reload roster only");
  expect(html).not.toContain("Stale editable roster");
});

test("read-only recovery shows the original per-person receipt and hides it from a different actor", async () => {
  const actor = "90000000-0000-4000-8000-000000000001";
  const registration = "90000000-0000-4000-8000-000000000002";
  const stamp = "2026-10-16T00:00:00.123456Z";
  const before = {
    registration_status: "approved",
    attendance_status: "not_marked",
    updated_at: stamp,
  };
  const operation: RosterAttendanceOperation = {
    id: "90000000-0000-4000-8000-000000000003",
    action: "roster_attendance",
    created_at: stamp,
    expires_at: stamp,
    activity_id: "90000000-0000-4000-8000-000000000004",
    activity_title: "Synthetic session",
    scope: { kind: "page", page: 1, page_size: 25, selected_count: 1 },
    state: "completed",
    notifications: [],
    rows: [
      {
        registration_id: registration,
        contact_name: "Synthetic person",
        participant_count: 2,
        before,
        target: {
          registration_id: registration,
          expected_updated_at: stamp,
          attendance_status: "attended",
          command: "record",
        },
        decision: "ready",
        reason: null,
      },
    ],
    results: [
      {
        registration_id: registration,
        kind: "applied",
        reason: null,
        before,
        current: before,
        after: { ...before, attendance_status: "attended" },
        event_id: "90000000-0000-4000-8000-000000000005",
        audit_id: "90000000-0000-4000-8000-000000000006",
      },
    ],
  };
  const controller = createAttendanceController({
    send: async () => {
      throw new Error("Unexpected network");
    },
    savePointer: async () => "session",
    readPointer: () => null,
    invalidate: async () => {
      throw new Error("Synthetic refresh failure");
    },
    onState: () => {},
  });
  await controller.hydrate(operation, actor, true);
  const props = {
    state: controller.getState(),
    controller,
    actorUserId: actor,
    onClearOperation: () => {},
  };
  const html = renderAdminInEnglish(<ActivityAttendanceRecovery {...props} />);
  expect(html).toContain("Saved, but reloading failed.");
  expect(html).toContain("Synthetic person");
  expect(html).toContain(registration);
  expect(html).toContain("2 participants");
  expect(html).toContain("Original attendance");
  expect(html).toContain("Attendance saved by this operation");
  expect(html).toContain("Reload roster only");
  expect(html).not.toContain('type="checkbox"');
  expect(
    renderAdminInEnglish(<ActivityAttendanceRecovery {...props} actorUserId="another-actor" />),
  ).not.toContain("Synthetic person");
});
