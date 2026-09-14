import {
  addHkDays,
  generationDates,
  hkDate,
  hkTimeLabel,
} from "../../../lib/volunteers/bulk/service";
import type { Row } from "./VolunteerActivityWorkspace";
export function ActivitySchedule({
  rows,
  view,
  from,
  until,
  ids,
  onToggle,
  onOpen,
}: {
  rows: Row[];
  view: string;
  from?: string;
  until?: string;
  ids: string[];
  onToggle: (id: string, checked: boolean) => void;
  onOpen: (id: string) => void;
}) {
  const select = (r: Row) => (
    <input
      type="checkbox"
      aria-label={`選取 ${hkTimeLabel(r.starts_at)} ${r.title}`}
      checked={ids.includes(r.id)}
      onChange={(e) => onToggle(r.id, e.target.checked)}
    />
  );
  const status = (r: Row) =>
    ({ draft: "草稿", published: "已發布", closed: "已結束", cancelled: "已取消" })[r.status] ??
    r.status;
  const open = (r: Row) => (
    <button className="min-h-11 text-left font-semibold underline" onClick={() => onOpen(r.id)}>
      {r.title}
    </button>
  );
  if (view !== "calendar")
    return (
      <div className="overflow-x-auto" tabIndex={0} aria-label="活動表格，可水平捲動">
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {["選取", "香港日期及時間", "活動／地點", "模板／政策", "報名及人手", "狀態"].map(
                (label) => (
                  <th className="p-3" key={label}>
                    {label}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-border)]">
                <td className="p-3">{select(r)}</td>
                <td className="p-3 whitespace-nowrap">
                  {hkTimeLabel(r.starts_at)}
                  {r.ends_at && <p>至 {hkTimeLabel(r.ends_at)}</p>}
                </td>
                <td className="p-3">
                  {open(r)}
                  <p>
                    {r.location} · {r.shelter_key ?? "待設定收容所"}
                  </p>
                </td>
                <td className="p-3">
                  {r.template_key ?? "須對應模板"}
                  <p>{r.policy_version_id ? "政策 v" + r.policy_revision : "待設定政策"}</p>
                  <p>
                    {r.scenario === "confirmed_group"
                      ? "已確認團體"
                      : r.scenario === "no_confirmed_group"
                        ? "未有已確認團體"
                        : "一般安排"}
                  </p>
                </td>
                <td className="p-3">
                  已確認 {r.approved} / {r.capacity} · 候補 {r.waitlisted}
                  {r.shortages.map((s) => (
                    <p key={s.role}>
                      尚欠 {s.role} {s.missing} 人
                    </p>
                  ))}
                </td>
                <td className="p-3">
                  {status(r)}
                  {r.registrations_closed_at && <p>已截止報名</p>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  const first = from ?? (rows[0] ? hkDate(new Date(rows[0].starts_at)) : hkDate());
  const last = until ?? addHkDays(first, 30);
  const contiguous = Date.parse(last) - Date.parse(first) <= 92 * 86400000;
  const days = contiguous
    ? generationDates(first, last, [0, 1, 2, 3, 4, 5, 6], [])
    : Array.from(new Set(rows.map((r) => hkDate(new Date(r.starts_at))))).sort();
  const padding = contiguous ? new Date(first + "T12:00:00+08:00").getUTCDay() : 0;
  return (
    <section aria-label="香港日期月曆">
      <p className="mb-3 text-sm">
        月曆顯示本頁最多25場活動；使用下方頁碼查看其餘場次。每格可開啟活動詳情。
      </p>
      <div className="hidden grid-cols-7 sm:grid" aria-hidden="true">
        {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
          <span className="p-2" key={day}>
            星期{day}
          </span>
        ))}
      </div>
      <div className="grid gap-2 sm:grid-cols-7">
        {Array.from({ length: padding }, (_, n) => (
          <div key={"pad" + n} className="hidden sm:block" />
        ))}
        {days.map((day) => (
          <section
            key={day}
            aria-label={day}
            className={
              "min-h-24 rounded border border-[var(--color-border)] p-2" +
              (rows.some((r) => hkDate(new Date(r.starts_at)) === day) ? "" : " hidden sm:block")
            }
          >
            <h3 className="text-sm font-bold">{day.slice(5)}</h3>
            {rows
              .filter((r) => hkDate(new Date(r.starts_at)) === day)
              .map((r) => (
                <article
                  key={r.id}
                  className="my-2 rounded bg-[var(--color-surface-offset)] p-2 text-xs"
                >
                  <div className="flex items-start gap-2">
                    {select(r)}
                    {open(r)}
                  </div>
                  <p>{hkTimeLabel(r.starts_at)}</p>
                  <p>
                    {r.shelter_key ?? r.location} · {status(r)}
                  </p>
                  <p>
                    已確認 {r.approved} · 候補 {r.waitlisted}
                  </p>
                  <p>{r.policy_version_id ? "政策 v" + r.policy_revision : "待設定政策"}</p>
                </article>
              ))}
          </section>
        ))}
      </div>
    </section>
  );
}
