import { expect, test } from "bun:test";
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
