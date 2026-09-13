import { useQuery } from "@tanstack/react-query";
import { ArrowRight, CalendarDays, ClipboardCheck, UserRoundSearch, Users } from "lucide-react";
import { fetchAdminJson } from "../../../lib/admin/http";
import { hongKongDayRange, type OverviewData } from "../../../lib/volunteers/overview";
type TodayActivity = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  status: string;
  policy?: unknown;
  approved_participants: number;
  capacity: number;
  shortages: { role: string; missing: number }[];
};
const time = (date: string) =>
  new Intl.DateTimeFormat("zh-HK", {
    timeZone: "Asia/Hong_Kong",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(new Date(date));
export function VolunteerOverview() {
  const range = hongKongDayRange(new Date());
  const stats = useQuery({
    queryKey: ["volunteer-overview", range.date],
    queryFn: () => fetchAdminJson<OverviewData>("/api/admin/volunteers/overview"),
    refetchInterval: 30000,
  });
  const calendar = useQuery({
    queryKey: ["volunteer-calendar", range.from, range.until],
    queryFn: () =>
      fetchAdminJson<{ activities: TodayActivity[]; truncated?: boolean }>(
        "/api/admin/volunteers/calendar?" +
          new URLSearchParams({ from: range.from, until: range.until }),
      ),
    refetchInterval: 30000,
  });
  const cards = [
    {
      key: "pendingProfiles" as const,
      label: "待核實義工",
      hint: "包含尚未報名的身份",
      href: "/admin/volunteers/people?status=pending",
      icon: UserRoundSearch,
    },
    {
      key: "pendingRegistrations" as const,
      label: "待審批報名",
      hint: "所有場次的待審批記錄",
      href: "/admin/volunteers/activities?registration_status=pending",
      icon: ClipboardCheck,
    },
    {
      key: "todayActivities" as const,
      label: "今日開始的場次",
      hint: "已發布場次 · 香港時間",
      href: "/admin/volunteers/calendar",
      icon: CalendarDays,
    },
  ];
  const activities = calendar.data?.activities.filter((a) => a.status === "published") ?? [];
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {stats.data?.date ?? range.date} · 香港時間
          </p>
          <h1 className="text-2xl font-bold">義工營運總覽</h1>
          <p className="mt-2 text-[var(--color-text-muted)]">
            由待辦開始，連接每位義工、每個場次及服務紀錄。
          </p>
        </div>
        <a
          href="/admin/volunteers/people"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-[var(--color-primary-foreground)]"
        >
          <UserRoundSearch size={18} />
          尋找義工
        </a>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => (
          <a
            key={card.key}
            href={card.href}
            className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
          >
            <card.icon size={22} className="mb-4 text-[var(--color-primary)]" />
            <p className="text-sm font-semibold">{card.label}</p>
            <p className="my-2 text-3xl font-bold tabular-nums">
              {stats.isLoading ? "…" : (stats.data?.counts[card.key] ?? "—")}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {stats.data?.counts[card.key] === null ? "此項暫未能讀取" : card.hint}
            </p>
          </a>
        ))}
      </div>
      {(stats.error || Object.values(stats.data?.counts ?? {}).some((x) => x === null)) && (
        <div role="alert">
          部分統計未能載入。
          <button onClick={() => void stats.refetch()} className="min-h-11 px-3 underline">
            重試統計
          </button>
        </div>
      )}
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">今日服務安排</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              包括跨日進行中的場次；缺額按現有月曆政策檢查顯示。
            </p>
          </div>
          <a
            href="/admin/volunteers/calendar"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm underline"
          >
            開啟月曆
            <ArrowRight size={16} />
          </a>
        </div>
        {calendar.isLoading && <p role="status">正在讀取今日場次…</p>}
        {calendar.error && (
          <div role="alert">
            未能載入今日場次。
            <button className="min-h-11 px-3 underline" onClick={() => void calendar.refetch()}>
              重新載入
            </button>
          </div>
        )}
        {calendar.data?.truncated && (
          <p role="status">資料量較大，此處只顯示部分記錄，請到月曆縮小範圍。</p>
        )}
        {calendar.isSuccess && activities.length === 0 && (
          <div className="py-8 text-center">
            <CalendarDays className="mx-auto mb-3 text-[var(--color-text-muted)]" />
            <p>今日沒有已發布場次。</p>
            <a href="/admin/volunteers/activities" className="inline-block py-3 underline">
              查看活動與報名
            </a>
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {activities.map((a) => (
            <article key={a.id} className="rounded-lg border border-[var(--color-border)] p-4">
              <p className="text-sm font-semibold text-[var(--color-primary)]">
                {time(a.starts_at)}–{a.ends_at ? time(a.ends_at) : "待定"}
              </p>
              <h3 className="mt-1 font-bold">{a.title}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">{a.location}</p>
              <p className="mt-3 flex items-center gap-2 text-sm">
                <Users size={16} />
                {a.approved_participants} 人已確認 · 場次容量 {a.capacity}
              </p>
              {!a.policy ? (
                <p className="mt-2 text-sm">尚未連結政策，未計算職務缺額。</p>
              ) : a.shortages.length ? (
                <p className="mt-2 text-sm text-[var(--color-warning)]">
                  {a.shortages.map((s) => `${s.role} 尚欠 ${s.missing} 人`).join(" · ")}
                </p>
              ) : (
                <p className="mt-2 text-sm">職務最低名額已達標</p>
              )}
              <a
                href={`/admin/volunteers/calendar?date=${range.date}&activity_id=${encodeURIComponent(a.id)}`}
                className="mt-2 inline-block min-h-11 py-2 text-sm underline"
              >
                查看場次及名單
              </a>
            </article>
          ))}
        </div>
      </section>
      <div className="grid gap-4 sm:grid-cols-2">
        <a
          href="/admin/volunteers/people"
          className="rounded-xl border border-[var(--color-border)] p-5"
        >
          <h2 className="font-bold">找到每一位義工</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            按姓名或電郵搜尋，查看身份、資格及服務紀錄。
          </p>
        </a>
        <a
          href="/admin/volunteers/tasks"
          className="rounded-xl border border-[var(--color-border)] p-5"
        >
          <h2 className="font-bold">跟進尚未完成的工作</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">
            處理報名、補位聯絡及通知失敗，記錄跟進結果。
          </p>
        </a>
      </div>
    </section>
  );
}
