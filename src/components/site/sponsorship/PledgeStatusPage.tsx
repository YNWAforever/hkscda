import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Heart,
  Loader2,
  Mail,
  RefreshCw,
  XCircle,
} from "lucide-react";
import type { ReactNode } from "react";

import { PublicStateShell } from "../PublicStateShell";

import { centsToHkd } from "../../../lib/donations/domain";

type SponsorshipPledgeStatus =
  | "pending_payment"
  | "provisional"
  | "active"
  | "needs_followup"
  | "cancelled";

type PublicPledgeStatusSummary = {
  reference: string;
  submittedAt: string;
  monthlyTier: "100" | "300" | "500" | "custom";
  amountCents: number;
  status: SponsorshipPledgeStatus;
  rankedAnimals: Array<{ rank: number; name: string }>;
  hasPaymentProof: boolean;
  expiresAt: string;
};

type StatusResponse = {
  status: PublicPledgeStatusSummary;
};

class PledgeStatusPageError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "PledgeStatusPageError";
    this.statusCode = statusCode;
  }
}

const PAYMENT_METHODS_ZH = [
  ["轉數快 FPS", "9864 1089"],
  ["銀行轉帳", "匯豐銀行 012-345-678901"],
  ["PayMe", "@hkscda"],
  ["PayPal", "paypal@hkscda.com"],
  ["Give.asia", "give.asia/hkscda"],
] as const;

const PLEDGE_STATUS_COPY: Record<
  SponsorshipPledgeStatus,
  { title: string; body: string; icon: ReactNode }
> = {
  pending_payment: {
    title: "等待您的付款",
    body: "請使用以下其中一種方式完成首月付款，並註明您的參考編號。",
    icon: <Clock3 className="h-5 w-5" aria-hidden="true" />,
  },
  provisional: {
    title: "已收到付款證明，正在核實中",
    body: "義工正在核實您的付款證明，核實後會發送確認通知。",
    icon: <Clock3 className="h-5 w-5" aria-hidden="true" />,
  },
  active: {
    title: "助養已確認，多謝支持！",
    body: "您的助養已正式生效，HKSCDA 會定期發送動物近況更新。",
    icon: <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" aria-hidden="true" />,
  },
  needs_followup: {
    title: "需要您協助跟進",
    body: "義工在核實過程中需要您提供更多資料，請透過以下電郵聯絡我們。",
    icon: <AlertCircle className="h-5 w-5" aria-hidden="true" />,
  },
  cancelled: {
    title: "此助養承諾已取消",
    body: "如有疑問或希望重新開始助養，歡迎聯絡 HKSCDA。",
    icon: <XCircle className="h-5 w-5" aria-hidden="true" />,
  },
};

const dateTimeFormatter = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Hong_Kong",
});

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

async function fetchPledgeStatus(token: string): Promise<StatusResponse> {
  const response = await fetch(`/api/sponsorships/status/${encodeURIComponent(token)}`, {
    headers: { accept: "application/json" },
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new PledgeStatusPageError(
      result.error ?? "Could not load sponsorship status",
      response.status,
    );
  }
  return result as StatusResponse;
}

function isPledgeStatusPageError(error: unknown): error is PledgeStatusPageError {
  return error instanceof PledgeStatusPageError;
}

function StateShell({
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

function LoadingState() {
  return (
    <StateShell
      icon={<Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />}
      title="正在載入助養狀態"
    >
      <p>請稍候，我們正在確認你的狀態連結。</p>
    </StateShell>
  );
}

function ExpiredState() {
  return (
    <StateShell
      role="alert"
      icon={<Clock3 className="h-7 w-7" aria-hidden="true" />}
      title="狀態連結已過期"
    >
      <p>為保障資料，狀態連結會定期失效。你可以電郵 HKSCDA 申請新的查閱連結。</p>
      <a
        href="mailto:info@hkscda.com?subject=Sponsorship%20status%20link%20request"
        className="btn-primary min-h-11 mt-5"
      >
        <Mail className="h-4 w-4" aria-hidden="true" />
        申請新連結
      </a>
    </StateShell>
  );
}

function MissingState() {
  return (
    <StateShell
      role="alert"
      icon={<AlertCircle className="h-7 w-7" aria-hidden="true" />}
      title="找不到此連結"
    >
      <p>連結可能已輸入錯誤或不再有效。你仍可返回助養區，重新查看可助養的動物。</p>
      <Link to="/sponsors" className="btn-primary min-h-11 mt-5">
        <Heart className="h-4 w-4" aria-hidden="true" />
        返回助養區
      </Link>
    </StateShell>
  );
}

function GenericErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <StateShell
      role="alert"
      icon={<AlertCircle className="h-7 w-7" aria-hidden="true" />}
      title="暫時未能載入"
    >
      <p>系統暫時未能讀取你的助養狀態。請稍後再試，或直接聯絡 HKSCDA。</p>
      <button type="button" onClick={onRetry} className="btn-primary min-h-11 mt-5">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        重新載入
      </button>
    </StateShell>
  );
}

function PledgeStatusContent({ status }: { status: PublicPledgeStatusSummary }) {
  const copy = PLEDGE_STATUS_COPY[status.status];

  return (
    <main className="bg-[var(--color-bg)] py-8">
      <div className="container-wide">
        <header className="grid gap-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5 text-[var(--color-text-inverse)] shadow-panel md:grid-cols-[minmax(0,1fr)_260px] md:p-7">
          <div>
            <p className="text-sm font-semibold text-[var(--color-accent-warm)]">
              Sponsorship pledge status
            </p>
            <h1 className="mt-2 text-3xl font-bold">助養承諾已收到</h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--color-lavender)]">
              這頁只顯示助養摘要及狀態，不包含付款證明或內部審核資料。
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-accent-warm)] bg-[var(--color-panel-2)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-accent-warm)]">
              Reference
            </p>
            <p className="mt-1 font-display text-2xl font-bold">{status.reference}</p>
            <p className="mt-3 text-xs text-[var(--color-lavender)]">
              Submitted {formatDateTime(status.submittedAt)}
            </p>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-5">
            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <div className="mt-1 shrink-0">{copy.icon}</div>
                <div>
                  <p className="text-sm font-semibold text-[var(--color-primary)]">
                    Current status
                  </p>
                  <h2 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">
                    {copy.title}
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">{copy.body}</p>
                </div>
              </div>

              {status.status === "pending_payment" && (
                <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {PAYMENT_METHODS_ZH.map(([label, value]) => (
                    <div
                      key={label}
                      className="rounded-lg bg-[var(--color-surface-offset)] p-3 text-sm"
                    >
                      <div className="text-xs font-semibold text-[var(--color-text-muted)]">
                        {label}
                      </div>
                      <div>{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {status.status === "needs_followup" && (
                <a
                  href={`mailto:info@hkscda.com?subject=Sponsorship%20pledge%20${encodeURIComponent(
                    status.reference,
                  )}`}
                  className="btn-primary min-h-11 mt-4"
                >
                  <Mail className="h-4 w-4" aria-hidden="true" />
                  info@hkscda.com
                </a>
              )}
            </article>

            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <h2 className="text-xl font-bold text-[var(--color-panel)]">助養動物</h2>
              <div className="mt-4 divide-y divide-[var(--color-divider)]">
                {status.rankedAnimals.map((animal) => (
                  <div
                    key={`${animal.rank}-${animal.name}`}
                    className="flex items-center gap-3 py-3"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary-highlight)] text-sm font-bold text-[var(--color-primary)]">
                      {animal.rank}
                    </div>
                    <p className="truncate font-semibold text-[var(--color-panel)]">
                      {animal.name}
                    </p>
                  </div>
                ))}
                {status.rankedAnimals.length === 0 ? (
                  <p className="py-3 text-sm text-[var(--color-text-muted)]">未有動物排序資料。</p>
                ) : null}
              </div>
            </article>
          </section>

          <aside className="space-y-5">
            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[var(--color-primary)]" aria-hidden="true" />
                <h2 className="text-lg font-bold text-[var(--color-panel)]">助養金額</h2>
              </div>
              <p className="mt-3 text-2xl font-bold text-[var(--color-panel)]">
                {centsToHkd(status.amountCents)}
                <span className="text-sm font-normal text-[var(--color-text-muted)]">/月</span>
              </p>
              {status.hasPaymentProof && (
                <p className="mt-2 text-xs text-[var(--color-text-muted)]">已收到付款證明</p>
              )}
            </article>

            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <h2 className="text-lg font-bold text-[var(--color-panel)]">需要協助？</h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                如資料有誤，請以參考編號聯絡 HKSCDA。
              </p>
              <a
                href={`mailto:info@hkscda.com?subject=Sponsorship%20pledge%20${encodeURIComponent(
                  status.reference,
                )}`}
                className="btn-outline mt-4 w-full"
              >
                <Mail className="h-4 w-4" aria-hidden="true" />
                info@hkscda.com
              </a>
              <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                Link expires {formatDateTime(status.expiresAt)}
              </p>
            </article>
          </aside>
        </div>
      </div>
    </main>
  );
}

export function PledgeStatusPage({ token }: { token: string }) {
  const statusQuery = useQuery<StatusResponse, PledgeStatusPageError>({
    queryKey: ["public-sponsorship-status", token],
    queryFn: () => fetchPledgeStatus(token),
    retry: (failureCount, error) => error.statusCode >= 500 && failureCount < 1,
  });

  if (statusQuery.isLoading) return <LoadingState />;
  if (statusQuery.isError) {
    if (isPledgeStatusPageError(statusQuery.error) && statusQuery.error.statusCode === 410) {
      return <ExpiredState />;
    }
    if (isPledgeStatusPageError(statusQuery.error) && statusQuery.error.statusCode === 404) {
      return <MissingState />;
    }
    return <GenericErrorState onRetry={() => void statusQuery.refetch()} />;
  }

  if (statusQuery.data) {
    return <PledgeStatusContent status={statusQuery.data.status} />;
  }

  return <GenericErrorState onRetry={() => void statusQuery.refetch()} />;
}
