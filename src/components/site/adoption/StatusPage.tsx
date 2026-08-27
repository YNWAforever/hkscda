import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  AlertCircle,
  CalendarDays,
  Cat,
  CheckCircle2,
  Clock3,
  Dog,
  Loader2,
  Mail,
  PawPrint,
  RefreshCw,
} from "lucide-react";
import type { ReactNode } from "react";

import { PublicStateShell } from "../PublicStateShell";

type PublicStatusSummary = {
  reference: string;
  submittedAt: string;
  applicantName: string;
  contactSummary: string;
  rankedAnimals: Array<{
    rank: number;
    name: string;
    type: string;
  }>;
  visitPreference: {
    dateRangeStart: string;
    dateRangeEnd: string;
    preferredTimeWindows: string[];
    notes: string | null;
  } | null;
  expiresAt: string;
};

type StatusResponse = {
  status: PublicStatusSummary;
};

class StatusPageError extends Error {
  statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = "StatusPageError";
    this.statusCode = statusCode;
  }
}

const VISIT_WINDOW_LABELS: Record<string, string> = {
  weekday_morning: "平日上午 Weekday morning",
  weekday_afternoon: "平日下午 Weekday afternoon",
  weekday_evening: "平日晚上 Weekday evening",
  weekend_morning: "週末上午 Weekend morning",
  weekend_afternoon: "週末下午 Weekend afternoon",
};

const NEXT_STEPS = [
  {
    title: "義工核對申請資料",
    body: "HKSCDA 會按動物需要、申請資料及探訪時段安排跟進。",
  },
  {
    title: "聯絡你確認探訪",
    body: "請留意電郵、電話或 WhatsApp，並保持申請時填寫的聯絡方式可用。",
  },
  {
    title: "預備家訪及安全設施",
    body: "如申請貓隻，請先準備窗網；如申請狗隻，請準備牽引及日常照顧安排。",
  },
];

const dateFormatter = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "medium",
  timeZone: "Asia/Hong_Kong",
});

const dateTimeFormatter = new Intl.DateTimeFormat("zh-HK", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Hong_Kong",
});

function formatDate(value: string) {
  const date = new Date(value.includes("T") ? value : `${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return value;
  return dateFormatter.format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return dateTimeFormatter.format(date);
}

function visitWindowLabel(value: string) {
  return VISIT_WINDOW_LABELS[value] ?? value;
}

async function fetchStatus(token: string): Promise<StatusResponse> {
  const response = await fetch(`/api/adoption/status/${encodeURIComponent(token)}`, {
    headers: { accept: "application/json" },
  });
  const result = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new StatusPageError(result.error ?? "Could not load adoption status", response.status);
  }
  return result as StatusResponse;
}

function isStatusPageError(error: unknown): error is StatusPageError {
  return error instanceof StatusPageError;
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

function AnimalIcon({ type }: { type: string }) {
  return type === "dog" ? (
    <Dog className="h-4 w-4" aria-hidden="true" />
  ) : (
    <Cat className="h-4 w-4" aria-hidden="true" />
  );
}

function LoadingState() {
  return (
    <StateShell
      icon={<Loader2 className="h-7 w-7 animate-spin" aria-hidden="true" />}
      title="正在載入申請狀態"
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
      <p>為保障申請資料，狀態連結會定期失效。你可以電郵 HKSCDA 申請新的查閱連結。</p>
      <a
        href="mailto:info@hkscda.com?subject=Adoption%20status%20link%20request"
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
      title="找不到此申請連結"
    >
      <p>連結可能已輸入錯誤或不再有效。你仍可返回待領養動物列表，重新查看可申請的貓狗。</p>
      <Link to="/animals/cat" className="btn-primary min-h-11 mt-5">
        <PawPrint className="h-4 w-4" aria-hidden="true" />
        返回待領養動物
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
      <p>系統暫時未能讀取你的申請狀態。請稍後再試，或請聯絡 HKSCDA。</p>
      <button type="button" onClick={onRetry} className="btn-primary min-h-11 mt-5">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
        重新載入
      </button>
    </StateShell>
  );
}

function StatusContent({ status }: { status: PublicStatusSummary }) {
  return (
    <main className="bg-[var(--color-bg)] py-8">
      <div className="container-wide">
        <header className="grid gap-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-panel)] p-5 text-[var(--color-text-inverse)] shadow-panel md:grid-cols-[minmax(0,1fr)_260px] md:p-7">
          <div>
            <p className="text-sm font-semibold text-[var(--color-secondary)]">領養申請狀態</p>
            <h1 className="mt-2 text-3xl font-bold">領養申請已收到</h1>
            <p className="mt-3 max-w-2xl text-sm text-[var(--color-surface-offset-2)]">
              這頁只顯示申請摘要及下一步安排，不包含相片、詳細問卷或內部審批狀態。
            </p>
          </div>
          <div className="rounded-lg border border-[var(--color-secondary)] bg-[var(--color-panel-2)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--color-secondary)]">
              參考編號
            </p>
            <p className="mt-1 font-display text-2xl font-bold">{status.reference}</p>
            <p className="mt-3 text-xs text-[var(--color-surface-offset-2)]">
              Submitted {formatDateTime(status.submittedAt)}
            </p>
          </div>
        </header>

        <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
          <section className="space-y-5">
            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <div className="flex items-start gap-3">
                <CheckCircle2
                  className="mt-1 h-5 w-5 shrink-0 text-[var(--color-success)]"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold text-[var(--color-primary)]">目前公開狀態</p>
                  <h2 className="mt-1 text-2xl font-bold text-[var(--color-panel)]">
                    申請已進入義工跟進流程
                  </h2>
                  <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                    HKSCDA 會按申請資料及動物情況安排聯絡。此頁不顯示內部審批或配對狀態。
                  </p>
                </div>
              </div>
            </article>

            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <h2 className="text-xl font-bold text-[var(--color-panel)]">動物排序</h2>
              <div className="mt-4 divide-y divide-[var(--color-divider)]">
                {status.rankedAnimals.map((animal) => (
                  <div
                    key={`${animal.rank}-${animal.name}`}
                    className="flex items-center gap-3 py-3"
                  >
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-primary-highlight)] text-sm font-bold text-[var(--color-primary)]">
                      {animal.rank}
                    </div>
                    <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--color-surface-offset-2)] text-[var(--color-panel)]">
                      <AnimalIcon type={animal.type} />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-[var(--color-panel)]">
                        {animal.name}
                      </p>
                      <p className="text-xs text-[var(--color-text-muted)]">
                        {animal.type === "dog" ? "狗隻 Dog" : "貓隻 Cat"}
                      </p>
                    </div>
                  </div>
                ))}
                {status.rankedAnimals.length === 0 ? (
                  <p className="py-3 text-sm text-[var(--color-text-muted)]">未有動物排序資料。</p>
                ) : null}
              </div>
            </article>

            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <h2 className="text-xl font-bold text-[var(--color-panel)]">下一步</h2>
              <ol className="mt-4 space-y-3">
                {NEXT_STEPS.map((step, index) => (
                  <li key={step.title} className="flex gap-3">
                    <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--color-panel)] text-xs font-bold text-[var(--color-text-inverse)]">
                      {index + 1}
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-[var(--color-panel)]">
                        {step.title}
                      </span>
                      <span className="block text-sm text-[var(--color-text-muted)]">
                        {step.body}
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            </article>
          </section>

          <aside className="space-y-5">
            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <h2 className="text-lg font-bold text-[var(--color-panel)]">申請人摘要</h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="font-semibold text-[var(--color-panel)]">姓名</dt>
                  <dd className="text-[var(--color-text-muted)]">{status.applicantName}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-[var(--color-panel)]">聯絡</dt>
                  <dd className="break-words text-[var(--color-text-muted)]">
                    {status.contactSummary}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <div className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5 text-[var(--color-primary)]" aria-hidden="true" />
                <h2 className="text-lg font-bold text-[var(--color-panel)]">探訪偏好</h2>
              </div>
              {status.visitPreference ? (
                <div className="mt-4 space-y-3 text-sm text-[var(--color-text-muted)]">
                  <p>
                    {formatDate(status.visitPreference.dateRangeStart)} 至{" "}
                    {formatDate(status.visitPreference.dateRangeEnd)}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {status.visitPreference.preferredTimeWindows.map((window) => (
                      <span
                        key={window}
                        className="rounded-full bg-[var(--color-primary-highlight)] px-3 py-1 text-xs font-semibold text-[var(--color-primary)]"
                      >
                        {visitWindowLabel(window)}
                      </span>
                    ))}
                  </div>
                  {status.visitPreference.notes ? (
                    <p className="rounded-md bg-[var(--color-surface-offset)] p-3">
                      {status.visitPreference.notes}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-sm text-[var(--color-text-muted)]">
                  未有探訪偏好資料。義工聯絡時會再確認合適時間。
                </p>
              )}
            </article>

            <article className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft">
              <h2 className="text-lg font-bold text-[var(--color-panel)]">需要協助？</h2>
              <p className="mt-2 text-sm text-[var(--color-text-muted)]">
                如資料有誤或超過一段時間未收到聯絡，請以參考編號聯絡 HKSCDA。
              </p>
              <a
                href={`mailto:info@hkscda.com?subject=Adoption%20application%20${encodeURIComponent(
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

export function StatusPage({ token }: { token: string }) {
  const statusQuery = useQuery<StatusResponse, StatusPageError>({
    queryKey: ["public-adoption-status", token],
    queryFn: () => fetchStatus(token),
    retry: (failureCount, error) => error.statusCode >= 500 && failureCount < 1,
  });

  if (statusQuery.isLoading) return <LoadingState />;
  if (statusQuery.isError) {
    if (isStatusPageError(statusQuery.error) && statusQuery.error.statusCode === 410) {
      return <ExpiredState />;
    }
    if (isStatusPageError(statusQuery.error) && statusQuery.error.statusCode === 404) {
      return <MissingState />;
    }
    return <GenericErrorState onRetry={() => void statusQuery.refetch()} />;
  }

  if (statusQuery.data) {
    return <StatusContent status={statusQuery.data.status} />;
  }

  return <GenericErrorState onRetry={() => void statusQuery.refetch()} />;
}
