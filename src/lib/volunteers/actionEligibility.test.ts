import { expect, test } from "bun:test";
import * as capabilities from "./actionEligibility";

test("attendance capabilities explain denials and preserve authoritative correction boundaries", () => {
  const base = {
    status: "approved",
    attendance_status: "not_marked",
    starts_at: "2026-10-16T01:00:00Z",
    ends_at: "2026-10-16T02:00:00Z",
    activity_status: "published",
  };
  const at = () => new Date("2026-10-16T03:00:00Z");
  const find = (input: typeof base, command: string, status: string) =>
    capabilities
      .attendanceActionCapabilities(input, at)
      .find((a) => a.command === command && a.attendance_status === status);
  expect(find(base, "record", "attended")).toMatchObject({ allowed: true, requires_reason: false });
  expect(find({ ...base, status: "waitlisted" }, "record", "attended")).toMatchObject({
    allowed: false,
    reason: "registration_not_approved",
  });
  expect(find({ ...base, status: "cancelled" }, "correct", "no_show")).toMatchObject({
    allowed: true,
    requires_reason: true,
  });
  expect(find({ ...base, activity_status: "cancelled" }, "correct", "attended")).toMatchObject({
    allowed: false,
    reason: "activity_cancelled",
  });
  expect(find({ ...base, attendance_status: "attended" }, "record", "completed")).toMatchObject({
    allowed: true,
    requires_reason: false,
  });
  expect(find({ ...base, attendance_status: "attended" }, "correct", "attended")).toMatchObject({
    allowed: false,
    reason: "unchanged",
  });
  const early = capabilities.attendanceActionCapabilities(
    base,
    () => new Date("2026-10-16T00:00:00Z"),
  );
  expect(
    early.find((a) => a.command === "record" && a.attendance_status === "attended"),
  ).toMatchObject({ allowed: false, reason: "future_attendance" });
});
import { volunteerActionEligibility } from "./actionEligibility";
const booking = {
  status: "approved",
  attendance_status: "not_marked",
  starts_at: "2026-10-10T01:00:00Z",
  ends_at: "2026-10-10T04:00:00Z",
};
test("attendance actions share start/end boundaries and factual transition constraints", () => {
  expect(volunteerActionEligibility(booking, new Date("2026-10-10T00:59:59Z"))).toMatchObject({
    attended: false,
    completed: false,
    no_show: false,
    reschedule: true,
  });
  expect(volunteerActionEligibility(booking, new Date(booking.starts_at))).toMatchObject({
    attended: true,
    completed: false,
    reschedule: false,
  });
  expect(volunteerActionEligibility(booking, new Date("2026-10-10T03:59:59.999Z")).completed).toBe(
    false,
  );
  expect(volunteerActionEligibility(booking, new Date(booking.ends_at)).completed).toBe(true);
  expect(
    volunteerActionEligibility({ ...booking, status: "cancelled" }, new Date(booking.ends_at)),
  ).toMatchObject({ attended: false, completed: false, no_show: false });
  expect(
    volunteerActionEligibility(
      { ...booking, attendance_status: "completed" },
      new Date(booking.ends_at),
    ).completed,
  ).toBe(false);
});
