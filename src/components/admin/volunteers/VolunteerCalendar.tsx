import { layoutCalendarEvents } from "../../../lib/volunteers/policy/calendarLayout";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
type Activity = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  capacity: number;
  shelter_key: string | null;
  status: string;
  group_headcount: number;
  policy_revision: number;
  approved_participants: number;
  waitlisted_participants: number;
  pending_participants: number;
  qualification_exceptions: number;
  policy?: { scenario: string; roles: { key: string; label: string }[] };
  shortages: { role: string; missing: number }[];
  roster: {
    id: string;
    contact_name: string;
    status: string;
    notes: string | null;
    attendance_status: string;
    tier: string | null;
    duty_role: string | null;
    qualification_exception: boolean;
  }[];
};
const dateKey = (date: Date) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Hong_Kong",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
const timeLabel = (value: string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(value));
const addDays = (value: string, days: number) => {
  const d = new Date(value + "T12:00:00+08:00");
  d.setUTCDate(d.getUTCDate() + days);
  return dateKey(d);
};
const button = "min-h-11 rounded border border-[var(--color-border)] px-3 py-2";
export function VolunteerCalendar() {
  const [date, setDate] = useState(() => {
    const requested =
      typeof window === "undefined"
        ? null
        : new URLSearchParams(window.location.search).get("date");
    return requested &&
      /^\d{4}-\d{2}-\d{2}$/.test(requested) &&
      !Number.isNaN(Date.parse(requested))
      ? requested
      : dateKey(new Date());
  });
  const [view, setView] = useState<"month" | "week" | "day" | "list">("month");
  const [shelter, setShelter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [shortOnly, setShortOnly] = useState(false);
  const [selected, setSelected] = useState<string | undefined>(() =>
    typeof window === "undefined"
      ? undefined
      : (new URLSearchParams(window.location.search).get("activity_id") ?? undefined),
  );
  const first =
    view === "month" || view === "list"
      ? date.slice(0, 7) + "-01"
      : view === "week"
        ? addDays(date, -new Date(date + "T12:00:00+08:00").getUTCDay())
        : date;
  const days =
    view === "day"
      ? 1
      : view === "week"
        ? 7
        : new Date(Date.UTC(Number(first.slice(0, 4)), Number(first.slice(5, 7)), 0)).getUTCDate();
  const until = addDays(first, days);
  const q = useQuery({
    queryKey: ["volunteer-calendar", first, until],
    queryFn: () =>
      fetchAdminJson<{ activities: Activity[]; truncated: boolean }>(
        "/api/admin/volunteers/calendar?" +
          new URLSearchParams({
            from: first + "T00:00:00+08:00",
            until: until + "T00:00:00+08:00",
          }),
      ),
    refetchInterval: 30000,
  });
  const activities = (q.data?.activities ?? []).filter(
    (a) =>
      (!shelter || a.shelter_key === shelter) &&
      (!statusFilter || a.status === statusFilter) &&
      (!shortOnly || a.shortages.length > 0 || a.qualification_exceptions > 0),
  );
  const detail = q.data?.activities.find((a) => a.id === selected);
  const event = (a: Activity) => (
    <button
      key={a.id}
      type="button"
      className="w-full rounded border border-[var(--color-primary)] bg-[var(--color-surface)] p-2 text-left text-sm"
      onClick={() => setSelected(a.id)}
    >
      <strong className="block">{a.title}</strong>
      <span className="block">
        {timeLabel(a.starts_at)}–{a.ends_at ? timeLabel(a.ends_at) : "待定"}
      </span>
      <span className="block">
        {a.approved_participants}/{a.capacity} 義工 · 候補 {a.waitlisted_participants}
      </span>
      {a.qualification_exceptions > 0 && (
        <span className="block">資格待處理 {a.qualification_exceptions}人</span>
      )}
      {a.shortages.map((s) => (
        <span className="block" key={s.role}>
          欠{s.role} {s.missing}人
        </span>
      ))}
    </button>
  );
  return (
    <section className="space-y-5">
      <header className="flex flex-wrap justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">義工營運月曆</h1>
          <a className="underline" href="/admin/volunteers/tasks">
            今日待辦與通知
          </a>
          <p>所有時間為香港時間。名單、名額及版本來自實際場次。</p>
        </div>
        <nav className="flex gap-4">
          <a href="/admin/volunteers/settings">規則設定</a>
          <a href="/admin/volunteers/operations">團體及改期</a>
          <a href="/admin/volunteers/qualifications">身份及資格核實</a>
          <a href="/admin/volunteers/activities">報名名單</a>
        </nav>
      </header>
      <div className="flex flex-wrap items-center gap-3">
        <label>
          顯示日期{" "}
          <input
            className={button}
            type="date"
            value={date}
            onChange={(e) => {
              if (e.target.value) setDate(e.target.value);
            }}
          />
        </label>
        {(
          [
            ["month", "月"],
            ["week", "週"],
            ["day", "日"],
            ["list", "列表"],
          ] as const
        ).map(([key, label]) => (
          <button
            className={button}
            key={key}
            aria-pressed={view === key}
            onClick={() => setView(key)}
          >
            {label}
          </button>
        ))}
        <label>
          場地{" "}
          <select className={button} value={shelter} onChange={(e) => setShelter(e.target.value)}>
            <option value="">全部</option>
            <option value="cat">貓舍</option>
            <option value="dog">狗舍</option>
            <option value="adoption">領養日</option>
          </select>
        </label>
        <label>
          <input
            type="checkbox"
            checked={shortOnly}
            onChange={(e) => setShortOnly(e.target.checked)}
          />{" "}
          只看人手不足／資格待處理
        </label>
      </div>
      <label>
        場次狀態{" "}
        <select
          className={button}
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">全部</option>
          <option value="published">開放</option>
          <option value="draft">草稿</option>
          <option value="closed">已關閉</option>
          <option value="cancelled">已取消</option>
        </select>
      </label>
      {q.isLoading && <p>載入月曆…</p>}
      {q.error && <p role="alert">未能載入月曆，請重新整理。</p>}
      {q.data?.truncated && <p role="alert">資料超過顯示上限，請縮小日期範圍。</p>}
      {(view === "month" || view === "list") && (
        <div className={view === "month" ? "grid grid-cols-1 gap-2 md:grid-cols-7" : "space-y-4"}>
          {view === "month" && (
            <>
              {["日", "一", "二", "三", "四", "五", "六"].map((day) => (
                <div key={day} className="hidden text-center font-semibold md:block">
                  星期{day}
                </div>
              ))}
              {Array.from({ length: new Date(first + "T12:00:00+08:00").getUTCDay() }, (_, i) => (
                <div key={`offset-${i}`} className="hidden md:block" aria-hidden="true" />
              ))}
            </>
          )}
          {Array.from({ length: days }, (_, i) => {
            const day = addDays(first, i);
            const entries = activities.filter((a) => dateKey(new Date(a.starts_at)) === day);
            return (
              <div key={day} className="min-h-24 space-y-2 rounded border p-2">
                <h2 className="font-semibold">{day.slice(5)}</h2>
                {entries.map(event)}
                {view === "list" && !entries.length && <p className="text-sm">沒有場次</p>}
              </div>
            );
          })}
        </div>
      )}
      {(view === "week" || view === "day") && (
        <div className="overflow-x-auto">
          <div
            className="grid min-w-[650px]"
            style={{ gridTemplateColumns: `60px repeat(${days}, minmax(0, 1fr))` }}
          >
            <div>時間</div>
            {Array.from({ length: days }, (_, i) => (
              <h2 key={i} className="border p-2 text-center">
                {addDays(first, i).slice(5)}
              </h2>
            ))}
            <div className="relative h-[960px]">
              {Array.from({ length: 24 }, (_, h) => (
                <span key={h} className="absolute text-xs" style={{ top: h * 40 }}>
                  {String(h).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {Array.from({ length: days }, (_, i) => {
              const day = addDays(first, i);
              const entries = activities.filter((a) => dateKey(new Date(a.starts_at)) === day);
              return (
                <div
                  key={day}
                  className="relative h-[960px] border"
                  style={{
                    backgroundImage:
                      "repeating-linear-gradient(to bottom, transparent, transparent 39px, var(--color-border) 40px)",
                  }}
                >
                  {entries.map((a) => {
                    const minute = (s: string) => {
                      const parts = timeLabel(s).split(":").map(Number);
                      return parts[0] * 60 + parts[1];
                    };
                    const placement = layoutCalendarEvents(entries).get(a.id)!;
                    return (
                      <div
                        key={a.id}
                        className="absolute overflow-auto p-0.5"
                        style={{
                          top: (minute(a.starts_at) * 2) / 3,
                          height: Math.max(
                            60,
                            ((minute(a.ends_at ?? a.starts_at) - minute(a.starts_at)) * 2) / 3,
                          ),
                          left: `${(placement.column * 100) / placement.columns}%`,
                          width: `${100 / placement.columns}%`,
                        }}
                      >
                        {event(a)}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {detail && (
        <aside aria-label="場次詳情" className="space-y-3 rounded-lg border p-5">
          <button className={button} onClick={() => setSelected(undefined)}>
            關閉詳情
          </button>
          <h2 className="text-xl font-bold">{detail.title}</h2>
          <p>
            {detail.location} · {detail.approved_participants}/{detail.capacity} 義工 · 團體訪客{" "}
            {detail.group_headcount} · 規則修訂 {detail.policy_revision}
          </p>
          <ul className="space-y-2">
            {detail.roster.map((r) => (
              <li key={r.id} className="rounded border p-3">
                <a href={`/admin/volunteers/registrations/${r.id}`}>{r.contact_name}</a> ·{" "}
                {(
                  {
                    pending: "待審批",
                    approved: "已確認",
                    waitlisted: "候補",
                    cancelled: "已取消",
                    rejected: "未獲批准",
                  } as Record<string, string>
                )[r.status] ?? "待核對"}{" "}
                ·{" "}
                {(
                  { not_marked: "未記出席", completed: "已出席", no_show: "未出席" } as Record<
                    string,
                    string
                  >
                )[r.attendance_status] ?? "待核對"}
                <p>
                  {(
                    { newcomer: "新手義工", regular: "恆常義工", senior: "資深義工" } as Record<
                      string,
                      string
                    >
                  )[r.tier ?? ""] ?? "資格待核實"}{" "}
                  · {detail.policy?.roles.find((role) => role.key === r.duty_role)?.label ?? "義工"}
                  {r.qualification_exception && " · 資格例外需跟進"}
                </p>
                <p>Remark：{r.notes || "未填寫"}</p>
              </li>
            ))}
          </ul>
        </aside>
      )}
    </section>
  );
}
