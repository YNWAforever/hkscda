import { createFileRoute, Link } from "@tanstack/react-router";
import { PublicStateShell } from "../../components/site/PublicStateShell";
import { AlertCircle, CalendarDays, CheckCircle2, Clock3, Loader2 } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

type VolunteerStatus = {
  reference: string;
  status: string;
  attendanceStatus: string;
  participantCount: number;
  activityTitle: string;
  startsAt: string;
  location: string;
};

export const Route = createFileRoute("/volunteer/status/$token")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: VolunteerStatusRoute,
});

function VolunteerStatusRoute() {
  const { token } = Route.useParams();
  const [status, setStatus] = useState<VolunteerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    void fetch(`/api/volunteer/status/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          registration?: VolunteerStatus;
        };
        if (!response.ok || !body.registration) {
          throw new Error(body.error ?? "找不到此義工登記");
        }
        setStatus(body.registration);
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "暫時未能載入"))
      .finally(() => setLoading(false));
  }, [token]);

  if (loading) {
    return (
      <StatusShell icon={<Loader2 className="h-7 w-7 animate-spin" />} title="正在載入義工登記">
        <p>請稍候，我們正在確認你的狀態連結。</p>
      </StatusShell>
    );
  }

  if (error || !status) {
    return (
      <StatusShell role="alert" icon={<AlertCircle className="h-7 w-7" />} title="找不到義工登記">
        <p>{error ?? "連結可能已過期或輸入錯誤。"}</p>
        <Link to="/volunteer" className="btn-primary min-h-11 mt-5">
          返回義工頁面
        </Link>
      </StatusShell>
    );
  }

  return (
    <main className="bg-[var(--color-bg)] py-8">
      <div className="container-wide">
        <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-6 shadow-soft">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm font-bold text-[var(--color-primary)]">義工登記狀態</p>
              <h1 className="font-display mt-2 text-3xl font-bold text-[var(--color-panel)]">
                {status.activityTitle}
              </h1>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                {status.reference} · {status.participantCount} 人
              </p>
            </div>
            <span className="rounded-full bg-[var(--color-primary-highlight)] px-4 py-2 text-sm font-bold text-[var(--color-primary)]">
              {status.status}
            </span>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-3">
            <InfoCard
              icon={<CalendarDays className="h-5 w-5" />}
              label="活動時間"
              value={new Date(status.startsAt).toLocaleString("zh-HK", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            />
            <InfoCard icon={<Clock3 className="h-5 w-5" />} label="地點" value={status.location} />
            <InfoCard
              icon={<CheckCircle2 className="h-5 w-5" />}
              label="出席狀態"
              value={status.attendanceStatus}
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function StatusShell({
  icon,
  title,
  children,
  role = "status",
}: {
  icon: ReactNode;
  title: string;
  children: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <main className="bg-[var(--color-bg)] py-10">
      <section className="container-wide">
        <PublicStateShell icon={icon} title={title} description={children} role={role} />
      </section>
    </main>
  );
}

function InfoCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-offset)] p-4">
      <div className="text-[var(--color-primary)]">{icon}</div>
      <p className="mt-3 text-xs font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
        {label}
      </p>
      <p className="mt-1 font-semibold text-[var(--color-panel)]">{value}</p>
    </div>
  );
}
