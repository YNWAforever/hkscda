import type { AttendanceActionCapability } from "./bulk/attendance";
/** Mirrors the authoritative attendance command; callers still handle server conflicts. */
export function volunteerActionEligibility(
  input: {
    status: string;
    attendance_status: string;
    starts_at: string;
    ends_at: string | null;
    activity_status?: string;
  },
  now = new Date(),
) {
  const started = Date.parse(input.starts_at) <= now.getTime();
  const ended = Date.parse(input.ends_at ?? input.starts_at) <= now.getTime();
  const approved = input.status === "approved" && input.activity_status !== "cancelled";
  const unmarked = input.attendance_status === "not_marked";
  return {
    attended: approved && started && unmarked,
    completed: approved && ended && (unmarked || input.attendance_status === "attended"),
    no_show: approved && ended && unmarked,
    reschedule:
      !started && unmarked && ["approved", "pending", "waitlisted"].includes(input.status),
  };
}

export type AttendanceCapabilityInput = {
  status: string;
  attendance_status: string;
  starts_at: string;
  ends_at: string | null;
  activity_status: string;
};
/** Server read projection only. The atomic RPC remains authoritative after acquiring locks. */
export function attendanceActionCapabilities(
  input: AttendanceCapabilityInput,
  now = () => new Date(),
): AttendanceActionCapability[] {
  const at = now().getTime();
  const started = Date.parse(input.starts_at) <= at;
  const ended = Date.parse(input.ends_at ?? input.starts_at) <= at;
  const output: AttendanceActionCapability[] = [];
  for (const command of ["record", "correct"] as const)
    for (const attendance_status of ["not_marked", "attended", "completed", "no_show"] as const) {
      let reason: AttendanceActionCapability["reason"] = null;
      if (attendance_status === input.attendance_status) reason = "unchanged";
      else if (
        attendance_status !== "not_marked" &&
        (!started || (attendance_status !== "attended" && !ended))
      )
        reason = "future_attendance";
      else if (
        command === "record" ||
        attendance_status === "attended" ||
        attendance_status === "completed"
      ) {
        if (input.activity_status === "cancelled") reason = "activity_cancelled";
        else if (input.status !== "approved") reason = "registration_not_approved";
      }
      if (
        !reason &&
        command === "record" &&
        !(
          (input.attendance_status === "not_marked" && attendance_status !== "not_marked") ||
          (input.attendance_status === "attended" && attendance_status === "completed")
        )
      )
        reason = "attendance_correction_required";
      output.push({
        command,
        attendance_status,
        allowed: reason === null,
        reason,
        requires_reason: command === "correct",
      });
    }
  return output;
}
