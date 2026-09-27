import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CalendarDays, ClipboardCheck, UserRoundSearch, Users } from "lucide-react";
import { fetchAdminJson } from "../../../lib/admin/http";
import { hongKongDayRange, type OverviewData } from "../../../lib/volunteers/overview";
import type { SessionCoverage } from "../../../lib/volunteers/sessionCoverage";
import { formatSessionDate, shelterLabel } from "../../site/volunteer/centreModel";
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
function CoverageCard({ label, coverage }: { label: string; coverage: SessionCoverage }) {
  const stateCopy: Record<SessionCoverage["state"], string> = {
    covered: "已排妥已發布場次",
    attention: "有待處理的場次",
    off_day: "所選日期屬休息日或不開放服務",
    no_approved_policy: "未有已核准政策，不能推斷應開場次",
    policy_inapplicable: "部分日期未有適用政策",
    unavailable: "覆蓋資料暫不可用",
  };
  return (
    <article className="rounded-lg border border-[var(--color-border)] p-4">
      <h3 className="font-bold">{label}</h3>
      <p className="mt-1 text-sm">{stateCopy[coverage.state]}</p>
      {coverage.scheduledSlots !== null ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt>應開場次</dt>
            <dd className="font-semibold tabular-nums">{coverage.scheduledSlots}</dd>
          </div>
          <div>
            <dt>已發布</dt>
            <dd className="font-semibold tabular-nums">{coverage.publishedSlots}</dd>
          </div>
          <div>
            <dt>未發布／政策未綁定</dt>
            <dd className="font-semibold tabular-nums">{coverage.unpublishedSlots}</dd>
          </div>
          <div>
            <dt>尚未建立</dt>
            <dd className="font-semibold tabular-nums">{coverage.missingSlots}</dd>
          </div>
          <div>
            <dt>休息日</dt>
            <dd className="font-semibold tabular-nums">{coverage.offDays}</dd>
          </div>
          <div>
            <dt>未適用政策日</dt>
            <dd className="font-semibold tabular-nums">{coverage.inapplicableDays}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-3 text-sm">
        {coverage.nextApprovedAt
          ? "下一個已發布場次：" + formatSessionDate(coverage.nextApprovedAt)
          : "暫無已核准的下次服務日期。"}
      </p>
      {coverage.blockers.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {coverage.blockers.slice(0, 5).map((blocker) => (
            <li key={blocker.date + blocker.templateKey}>
              {blocker.date} · {blocker.policyName}：
              {blocker.reason === "missing"
                ? "尚未建立場次"
                : blocker.reason === "unpublished"
                  ? "尚未發布"
                  : "政策未綁定或不適用"}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

export function VolunteerOverview() {
  const [centre, setCentre] = useState("all");
  const range = hongKongDayRange(new Date());
  const stats = useQuery({
    queryKey: ["volunteer-overview", range.date, centre],
    queryFn: () =>
      fetchAdminJson<OverviewData>(
        "/api/admin/volunteers/overview?" + new URLSearchParams({ centre }),
      ),
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
      <section
        aria-label="未來服務覆蓋"
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">未來 14／30 日服務覆蓋</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              按已核准政策及實際場次計算；休息日不列為缺場。發布或預約時仍會重新驗證。
            </p>
          </div>
          <label className="text-sm">
            服務地點
            <select
              className="ml-2 min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2"
              value={centre}
              onChange={(event) => setCentre(event.target.value)}
            >
              <option value="all">所有地點</option>
              {(stats.data?.coverage?.centres ?? []).map((key) => (
                <option key={key} value={key}>
                  {shelterLabel(key)}
                </option>
              ))}
            </select>
          </label>
        </div>
        {stats.isLoading ? (
          <p role="status" className="mt-4">
            正在讀取服務覆蓋…
          </p>
        ) : stats.data?.coverage ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <CoverageCard label="未來 14 日" coverage={stats.data.coverage.next14} />
            <CoverageCard label="未來 30 日" coverage={stats.data.coverage.next30} />
          </div>
        ) : (
          <p role="status" className="mt-4">
            覆蓋資料暫未能讀取；請勿把未知當作零場。
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <a className="min-h-11 py-2 underline" href="/admin/volunteers/activities">
            前往場次工作台產生及預覽
          </a>
          <a className="min-h-11 py-2 underline" href="/admin/volunteers/settings">
            檢查已核准政策
          </a>
        </div>
      </section>
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
