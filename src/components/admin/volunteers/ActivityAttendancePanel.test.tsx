import { expect, test } from "bun:test";
import { renderAdminInEnglish, expectNoChineseText } from "../i18n/testing";
import { ActivityAttendancePanel } from "./ActivityAttendancePanel";
import { createAttendanceController } from "../../../lib/volunteers/bulk/attendanceRecovery";
import type { ActivityDetail } from "./activityWorkspaceTypes";
const actor = "90000000-0000-4000-8000-000000000001",
  id = "90000000-0000-4000-8000-000000000002",
  other = "90000000-0000-4000-8000-000000000003";
const stamp = "2026-10-16T00:00:00.123456Z";
const detail: ActivityDetail = {
  attendance_contract: 1,
  asOf: "2026-10-16T03:00:00Z",
  activity: {
    id,
    title: "Synthetic session",
    starts_at: "2026-10-16T01:00:00Z",
    ends_at: "2026-10-16T02:00:00Z",
    location: "Synthetic venue",
    status: "published",
    capacity: 10,
    template_key: null,
    shelter_key: null,
    policy_version_id: null,
    policy_revision: 0,
    updated_at: stamp,
    scenario: null,
    approved: 2,
    waitlisted: 1,
    shortages: [],
    registrations_closed_at: null,
    description: null,
  },
  registrations: [
    {
      id,
      contact_name: "Synthetic same name",
      status: "approved",
      attendance_status: "not_marked",
      updated_at: stamp,
      participant_count: 2,
      attendance_actions: [
        {
          command: "record",
          attendance_status: "attended",
          allowed: true,
          reason: null,
          requires_reason: false,
        },
      ],
    },
    {
      id: other,
      contact_name: "Synthetic same name",
      status: "waitlisted",
      attendance_status: "not_marked",
      updated_at: stamp,
      participant_count: 1,
      attendance_actions: [
        {
          command: "record",
          attendance_status: "attended",
          allowed: false,
          reason: "registration_not_approved",
          requires_reason: false,
        },
      ],
    },
  ],
  total: 2,
  history_total: 0,
  history: [],
};
function controller() {
  const c = createAttendanceController({
    send: async () => {
      throw new Error("unexpected write");
    },
    savePointer: async () => "session",
    readPointer: () => null,
    invalidate: async () => {},
    onState: () => {},
  });
  c.clearIdentity(actor);
  return c;
}
test("inline roster exposes page scope, same-name references, group size and denial reason in English", () => {
  const control = controller();
  const markup = renderAdminInEnglish(
    <ActivityAttendancePanel
      detail={detail}
      page={1}
      actorUserId={actor}
      state={control.getState()}
      controller={control}
      refreshing={false}
      onReload={async () => {}}
      onClearOperation={() => {}}
    />,
  );
  expectNoChineseText(markup);
  expect(markup).toContain("Select this page (2 registrations)");
  expect(markup).toContain("2 participants");
  expect(markup).toContain(id);
  expect(markup).toContain(other);
  expect(markup).toContain("Registration is not approved");
  expect(markup).toContain("Preview selected attendance");
});
test("old backend detail cannot silently fall back to attendance for the entire session", () => {
  const control = controller();
  const markup = renderAdminInEnglish(
    <ActivityAttendancePanel
      detail={{ ...detail, attendance_contract: undefined }}
      page={1}
      actorUserId={actor}
      state={control.getState()}
      controller={control}
      refreshing={false}
      onReload={async () => {}}
      onClearOperation={() => {}}
    />,
  );
  expect(markup).toContain("Open registration details to continue");
  expect(markup).not.toContain("Preview selected attendance");
});
test("an unknown registration status stays visible instead of becoming a blank or approved label", () => {
  const control = controller();
  const unknown = {
    ...detail,
    registrations: [{ ...detail.registrations[0], status: "future_state" }],
  };
  const markup = renderAdminInEnglish(
    <ActivityAttendancePanel
      detail={unknown}
      page={1}
      actorUserId={actor}
      state={control.getState()}
      controller={control}
      refreshing={false}
      onReload={async () => {}}
      onClearOperation={() => {}}
    />,
  );
  expect(markup).toContain("future_state");
});
test("an unmarked cancelled registration exposes a server-authorized reasoned correction", () => {
  const control = controller();
  const cancelled: ActivityDetail = {
    ...detail,
    registrations: [
      {
        ...detail.registrations[0],
        status: "cancelled",
        attendance_status: "not_marked",
        attendance_actions: [
          {
            command: "record",
            attendance_status: "no_show",
            allowed: false,
            reason: "registration_not_approved",
            requires_reason: false,
          },
          {
            command: "correct",
            attendance_status: "no_show",
            allowed: true,
            reason: null,
            requires_reason: true,
          },
        ],
      },
    ],
  };
  const markup = renderAdminInEnglish(
    <ActivityAttendancePanel
      detail={cancelled}
      page={1}
      actorUserId={actor}
      state={control.getState()}
      controller={control}
      refreshing={false}
      onReload={async () => {}}
      onClearOperation={() => {}}
    />,
  );
  expect(markup).toContain("Record attendance as a correction");
});
test("a lost unsubmitted preview can be explicitly cancelled without offering a write retry", async () => {
  const control = createAttendanceController({
    send: async () => {
      throw new Error("offline");
    },
    savePointer: async () => "session",
    readPointer: () => null,
    invalidate: async () => {},
    onState: () => {},
  });
  await control.preview(
    {
      action: "attendance_preview",
      activity_id: id,
      expected_activity_updated_at: stamp,
      page: 1,
      page_size: 25,
      entries: [
        {
          registration_id: id,
          expected_updated_at: stamp,
          attendance_status: "attended",
          command: "record",
        },
      ],
      idempotency_key: actor,
    },
    actor,
  );
  const markup = renderAdminInEnglish(
    <ActivityAttendancePanel
      detail={detail}
      page={1}
      actorUserId={actor}
      state={control.getState()}
      controller={control}
      refreshing={false}
      onReload={async () => {}}
      onClearOperation={() => {}}
    />,
  );
  expect(markup).toContain(">Cancel preview</button>");
  expect(markup).not.toContain(">Confirm selected attendance</button>");
});
