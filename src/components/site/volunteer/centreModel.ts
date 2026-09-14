import type { PolicySession } from "../../../lib/volunteers/policy/booking";
export const tierLabels: Record<string, string> = {
  newcomer: "新手義工",
  regular: "恆常義工",
  senior: "資深義工",
};
export const statusLabels: Record<string, string> = {
  approved: "已確認",
  pending: "待審核",
  waitlisted: "候補中",
  cancelled: "已取消",
  rejected: "未獲批准",
};
export const attendanceLabels: Record<string, string> = {
  attended: "已核實出席",
  completed: "已完成服務",
  absent: "缺席",
  no_show: "未有出席",
  excused: "已請假",
  pending: "待記錄",
  not_recorded: "尚未核實",
  unknown: "尚未核實",
};
export function formatSessionDate(value: string | null | undefined) {
  return value && Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat("zh-HK", {
        timeZone: "Asia/Hong_Kong",
        month: "short",
        day: "numeric",
        weekday: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "日期待確認";
}
function hkDate(value: string) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  return ["year", "month", "day"].map((k) => p.find((v) => v.type === k)?.value).join("-");
}
export function filterCentreSessions(
  sessions: PolicySession[],
  filters: { query: string; shelter: string; date: string },
) {
  return sessions.filter(
    (s) =>
      (filters.shelter === "all" || s.shelter === filters.shelter) &&
      (!filters.date || hkDate(s.starts_at) === filters.date) &&
      (!filters.query.trim() ||
        `${s.title} ${s.location}`
          .toLocaleLowerCase()
          .includes(filters.query.trim().toLocaleLowerCase())),
  );
}
export function registrationSection(
  entry: { status: string; attendance_status: string; activity?: { starts_at: string } | null },
  now: Date,
): "upcoming" | "past" | "closed" {
  if (["cancelled", "rejected"].includes(entry.status)) return "closed";
  if (
    ["attended", "completed", "absent", "no_show", "excused"].includes(entry.attendance_status) ||
    (entry.activity?.starts_at && Date.parse(entry.activity.starts_at) < now.getTime())
  )
    return "past";
  return "upcoming";
}
export function shelterLabel(value: string) {
  return (
    (
      {
        cat: "貓舍",
        dog: "狗舍",
        cat_shelter: "貓舍",
        dog_shelter: "狗舍",
        adoption: "領養日",
      } as Record<string, string>
    )[value] ?? value
  );
}

export function formatSessionRange(
  start: string | null | undefined,
  end: string | null | undefined,
) {
  return `${formatSessionDate(start)}${end ? ` — ${formatSessionDate(end)}` : " · 結束時間待確認"}`;
}
