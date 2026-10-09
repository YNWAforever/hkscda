import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, CalendarDays, ClipboardCheck, UserRoundSearch, Users } from "lucide-react";
import { fetchAdminJson } from "../../../lib/admin/http";
import { hongKongDayRange, type OverviewData } from "../../../lib/volunteers/overview";
import type { SessionCoverage } from "../../../lib/volunteers/sessionCoverage";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { isNamedShelter, volunteerCommonCopy } from "./volunteerCommonCopy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
import { volunteerOverviewCopy } from "./volunteerOverviewCopy";
import { LoadFailure } from "../LoadFailure";
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
function CoverageCard({ label, coverage }: { label: string; coverage: SessionCoverage }) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerOverviewCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  /** A count of sessions or days; a figure the server could not work out shows nothing. */
  const figure = (value: number | null) => (value === null ? null : format.number(value));
  return (
    <article className="rounded-lg border border-[var(--color-border)] p-4">
      <h3 className="font-bold">{label}</h3>
      <p className="mt-1 text-sm">{copy.states[coverage.state]}</p>
      {coverage.scheduledSlots !== null ? (
        <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div>
            <dt>{copy.figures.scheduled}</dt>
            <dd className="font-semibold tabular-nums">{figure(coverage.scheduledSlots)}</dd>
          </div>
          <div>
            <dt>{copy.figures.published}</dt>
            <dd className="font-semibold tabular-nums">{figure(coverage.publishedSlots)}</dd>
          </div>
          <div>
            <dt>{copy.figures.unpublished}</dt>
            <dd className="font-semibold tabular-nums">{figure(coverage.unpublishedSlots)}</dd>
          </div>
          <div>
            <dt>{copy.figures.missing}</dt>
            <dd className="font-semibold tabular-nums">{figure(coverage.missingSlots)}</dd>
          </div>
          <div>
            <dt>{copy.figures.offDays}</dt>
            <dd className="font-semibold tabular-nums">{figure(coverage.offDays)}</dd>
          </div>
          <div>
            <dt>{copy.figures.inapplicableDays}</dt>
            <dd className="font-semibold tabular-nums">{figure(coverage.inapplicableDays)}</dd>
          </div>
        </dl>
      ) : null}
      <p className="mt-3 text-sm">
        {coverage.nextApprovedAt
          ? copy.nextPublished(format.coverageDate(coverage.nextApprovedAt))
          : copy.noNextDate}
      </p>
      {coverage.blockers.length ? (
        <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
          {coverage.blockers.slice(0, 5).map((blocker) => (
            <li key={blocker.date + blocker.templateKey}>
              {copy.blocker(
                format.day(blocker.date),
                blocker.policyName,
                copy.blockerReasons[blocker.reason],
              )}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}

/** What a count card shows: an ellipsis while it loads, the figure, or a dash when there is none. */
function countText(
  loading: boolean,
  count: number | null | undefined,
  number: (value: number) => string,
) {
  if (loading) return "…";
  return typeof count === "number" ? number(count) : "—";
}

export function VolunteerOverview() {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerOverviewCopy, language);
  const common = pickAdminCopy(volunteerCommonCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
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
      href: "/admin/volunteers/people?status=pending",
      icon: UserRoundSearch,
    },
    {
      key: "pendingRegistrations" as const,
      href: "/admin/volunteers/activities?registration_status=pending",
      icon: ClipboardCheck,
    },
    {
      key: "todayActivities" as const,
      href: "/admin/volunteers/calendar",
      icon: CalendarDays,
    },
  ];
  const activities = calendar.data?.activities.filter((a) => a.status === "published") ?? [];
  const centres = stats.data?.coverage?.centres ?? [];
  const unnamedCentres = centres.filter((key) => !isNamedShelter(key));
  return (
    <section className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--color-text-muted)]">
            {format.day(stats.data?.date ?? range.date)} · {copy.hongKongTime}
          </p>
          <h1 className="text-2xl font-bold">{copy.title}</h1>
          <p className="mt-2 text-[var(--color-text-muted)]">{copy.intro}</p>
        </div>
        <a
          href="/admin/volunteers/people"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-primary)] px-4 text-[var(--color-primary-foreground)]"
        >
          <UserRoundSearch size={18} />
          {copy.findVolunteer}
        </a>
      </header>
      <div className="grid gap-4 sm:grid-cols-3">
        {cards.map((card) => {
          const count = stats.data?.counts[card.key];
          return (
            <a
              key={card.key}
              href={card.href}
              className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
            >
              <card.icon size={22} className="mb-4 text-[var(--color-primary)]" />
              <p className="text-sm font-semibold">{copy.cards[card.key].label}</p>
              <p className="my-2 text-3xl font-bold tabular-nums">
                {countText(stats.isLoading, count, format.number)}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {count === null ? copy.cardUnavailable : copy.cards[card.key].hint}
              </p>
            </a>
          );
        })}
      </div>
      {stats.error ? (
        <LoadFailure
          error={stats.error}
          onRetry={() => void stats.refetch()}
          title={copy.statsFailed}
          retryLabel={copy.retryStats}
        />
      ) : Object.values(stats.data?.counts ?? {}).some((x) => x === null) ? (
        <div role="alert">
          {copy.statsFailed}
          <button onClick={() => void stats.refetch()} className="min-h-11 px-3 underline">
            {copy.retryStats}
          </button>
        </div>
      ) : null}
      <section
        aria-label={copy.coverage.label}
        className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{copy.coverage.title}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{copy.coverage.hint}</p>
          </div>
          <label className="text-sm">
            {copy.coverage.location}
            <select
              className="ml-2 min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2"
              value={centre}
              onChange={(event) => setCentre(event.target.value)}
            >
              <option value="all">{copy.coverage.allLocations}</option>
              {centres.map((key) => (
                <option key={key} value={key}>
                  {common.shelterName(key, {
                    position: unnamedCentres.indexOf(key) + 1,
                    total: unnamedCentres.length,
                  })}
                </option>
              ))}
            </select>
          </label>
        </div>
        {stats.isLoading ? (
          <p role="status" className="mt-4">
            {copy.coverage.loading}
          </p>
        ) : stats.data?.coverage ? (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <CoverageCard label={copy.coverage.next14} coverage={stats.data.coverage.next14} />
            <CoverageCard label={copy.coverage.next30} coverage={stats.data.coverage.next30} />
          </div>
        ) : (
          <p role="status" className="mt-4">
            {copy.coverage.unavailable}
          </p>
        )}
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <a className="min-h-11 py-2 underline" href="/admin/volunteers/activities">
            {copy.coverage.generateLink}
          </a>
          <a className="min-h-11 py-2 underline" href="/admin/volunteers/settings">
            {copy.coverage.policyLink}
          </a>
        </div>
      </section>
      <section className="rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold">{copy.today.title}</h2>
            <p className="text-sm text-[var(--color-text-muted)]">{copy.today.hint}</p>
          </div>
          <a
            href="/admin/volunteers/calendar"
            className="inline-flex min-h-11 shrink-0 items-center gap-1 text-sm underline"
          >
            {copy.today.openCalendar}
            <ArrowRight size={16} />
          </a>
        </div>
        {calendar.isLoading && <p role="status">{copy.today.loading}</p>}
        {calendar.error && (
          <LoadFailure
            error={calendar.error}
            onRetry={() => void calendar.refetch()}
            title={copy.today.loadFailed}
            retryLabel={copy.today.reload}
          />
        )}
        {calendar.data?.truncated && <p role="status">{copy.today.truncated}</p>}
        {calendar.isSuccess && activities.length === 0 && (
          <div className="py-8 text-center">
            <CalendarDays className="mx-auto mb-3 text-[var(--color-text-muted)]" />
            <p>{copy.today.empty}</p>
            <a href="/admin/volunteers/activities" className="inline-block py-3 underline">
              {copy.today.viewActivities}
            </a>
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {activities.map((a) => (
            <article key={a.id} className="rounded-lg border border-[var(--color-border)] p-4">
              <p className="text-sm font-semibold text-[var(--color-primary)]">
                {format.clock(a.starts_at)}–
                {a.ends_at ? format.clock(a.ends_at) : copy.today.timeTbc}
              </p>
              <h3 className="mt-1 font-bold">{a.title}</h3>
              <p className="text-sm text-[var(--color-text-muted)]">{a.location}</p>
              <p className="mt-3 flex items-center gap-2 text-sm">
                <Users size={16} />
                {copy.today.confirmed(a.approved_participants, a.capacity)}
              </p>
              {!a.policy ? (
                <p className="mt-2 text-sm">{copy.today.noPolicy}</p>
              ) : a.shortages.length ? (
                <p className="mt-2 text-sm text-[var(--color-warning)]">
                  {a.shortages
                    .map((s) => copy.today.shortage(s.role, s.missing))
                    .join(copy.today.shortageSeparator)}
                </p>
              ) : (
                <p className="mt-2 text-sm">{copy.today.minimumMet}</p>
              )}
              <a
                href={`/admin/volunteers/calendar?date=${range.date}&activity_id=${encodeURIComponent(a.id)}`}
                className="mt-2 inline-block min-h-11 py-2 text-sm underline"
              >
                {copy.today.viewSession}
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
          <h2 className="font-bold">{copy.links.findTitle}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{copy.links.findText}</p>
        </a>
        <a
          href="/admin/volunteers/tasks"
          className="rounded-xl border border-[var(--color-border)] p-5"
        >
          <h2 className="font-bold">{copy.links.followTitle}</h2>
          <p className="mt-2 text-sm text-[var(--color-text-muted)]">{copy.links.followText}</p>
        </a>
      </div>
    </section>
  );
}
