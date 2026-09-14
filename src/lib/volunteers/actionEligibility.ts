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
