import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../../ui/tabs";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { DirectoryDetail } from "../../../lib/volunteers/directory/types";
import { volunteerRegistrationStatusLabelsFor } from "../../../lib/volunteers/labels";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { directoryQuery, type DirectorySearch } from "./directorySearch";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { volunteerDirectoryCopy } from "./volunteerDirectoryCopy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
import { volunteerPersonCopy } from "./volunteerPersonCopy";
const card =
  "min-w-0 space-y-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-5";
const action =
  "inline-flex min-h-11 items-center justify-center rounded-lg border border-[var(--color-border)] px-4 py-2 font-medium text-[var(--color-primary)] focus-visible:outline-2";

/** The copy of the page in the admin's language, with the date and status helpers it needs. */
function usePersonText() {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerPersonCopy, language);
  const common = pickAdminCopy(volunteerCommonCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const registrationLabels: Record<string, string> = volunteerRegistrationStatusLabelsFor(language);
  /** A date, or "not recorded" when there is none. */
  const date = (value: string | null) => (value ? format.profileDate(value) : copy.notRecorded);
  /** The label of a stored status, or "other status" when the page has no label for it. */
  const label = (labels: Record<string, string>, value: string) =>
    labels[value] || copy.otherStatus(value);
  return {
    language,
    copy,
    directory: pickAdminCopy(volunteerDirectoryCopy, language),
    attendanceLabels: common.attendance as Record<string, string>,
    registrationLabels,
    date,
    label,
  };
}

function AttendanceFact({ fact }: { fact: Record<string, unknown> }) {
  const { copy, attendanceLabels, label } = usePersonText();
  return (
    <span>
      {typeof fact.attendanceStatus === "string"
        ? label(attendanceLabels, fact.attendanceStatus)
        : copy.attendance.statusNotRecorded}
      {copy.attendance.hours(typeof fact.volunteerHours === "number" ? fact.volunteerHours : null)}
    </span>
  );
}

/** Whether the account is linked, and if so whether its email is verified. */
function emailStateOf(profile: DirectoryDetail["profile"]): "unlinked" | "verified" | "unverified" {
  if (!profile.account_linked) return "unlinked";
  return profile.email_verified ? "verified" : "unverified";
}

/** What the header says about the account email and the staff verification. */
function accountLine(
  profile: DirectoryDetail["profile"],
  text: ReturnType<typeof usePersonText>,
): string {
  const { copy, date } = text;
  const verification = profile.verified_at
    ? copy.verification.verified(date(profile.verified_at))
    : copy.verification.awaiting;
  return copy.accountLine(copy.emailState[emailStateOf(profile)], verification);
}

export function PersonRecords({
  data,
  search,
  initialTab = "identity",
}: {
  data: DirectoryDetail;
  search: DirectorySearch;
  initialTab?: string;
}) {
  const text = usePersonText();
  const { copy, directory, attendanceLabels, registrationLabels, date, label } = text;
  const { profile, coverage } = data;
  return (
    <div className="min-w-0 space-y-6">
      <div className="flex flex-wrap gap-3">
        <a className={action} href={`/admin/volunteers/people?${directoryQuery(search)}`}>
          {copy.back}
        </a>
        <a
          className={`${action} bg-[var(--color-primary)] text-[var(--color-primary-foreground)]`}
          href={`/admin/volunteers/qualifications?profile_id=${encodeURIComponent(profile.id)}`}
        >
          {copy.verifyLink}
        </a>
      </div>
      <header className={card}>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="break-words text-2xl font-semibold">
            {profile.display_name || copy.unnamed}
          </h2>
          <span className="rounded-full bg-[var(--color-muted)] px-3 py-1 text-sm">
            {directory.statuses[profile.status]}
          </span>
          <span className="text-sm">{directory.tiers[profile.tier]}</span>
        </div>
        <p className="break-all">
          {profile.account_linked ? profile.linked_email || copy.noEmail : copy.notLinked}
        </p>
        <p>{accountLine(profile, text)}</p>
        <p className="break-all text-xs text-[var(--color-muted-foreground)]">
          {copy.profileId(profile.id)}
        </p>
      </header>
      <aside className="rounded-xl bg-[var(--color-muted)] p-4 text-sm">
        <p className="font-medium">{copy.coverage.title}</p>
        <p className="mt-1">
          {copy.coverage.text(
            coverage.history_coverage_start ? date(coverage.history_coverage_start) : null,
            coverage.records_limit,
          )}
        </p>
      </aside>
      <Tabs defaultValue={initialTab} className="min-w-0">
        <TabsList
          className="grid h-auto w-full grid-cols-2 gap-1 sm:grid-cols-4"
          aria-label={copy.tabsLabel}
        >
          {(["identity", "registrations", "attendance", "audit"] as const).map((value) => (
            <TabsTrigger
              key={value}
              value={value}
              className="min-h-11 whitespace-normal motion-reduce:transition-none"
            >
              {copy.tabs[value]}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="identity" className="mt-4 space-y-4">
          <section className={card}>
            <h3 className="text-lg font-semibold">{copy.identity.title}</h3>
            <dl className="grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-[var(--color-muted-foreground)]">
                  {copy.identity.birthDate}
                </dt>
                <dd>{date(profile.birth_date)}</dd>
              </div>
              <div>
                <dt className="text-sm text-[var(--color-muted-foreground)]">
                  {copy.identity.joinedOn}
                </dt>
                <dd>{date(profile.joined_on)}</dd>
              </div>
            </dl>
            <p className="text-sm">{copy.identity.note}</p>
          </section>
          <section className={card}>
            <h3 className="text-lg font-semibold">{copy.identity.evidenceTitle}</h3>
            <p className="text-sm">
              {copy.identity.showing(data.credentials.length, coverage.credential_total)}
            </p>
            {data.credentials.length === 0 ? (
              <p>{copy.identity.none}</p>
            ) : (
              <ul className="space-y-4">
                {data.credentials.map((item) => (
                  <li key={item.id} className="border-t border-[var(--color-border)] pt-3">
                    <h4 className="font-semibold">
                      {item.label} {item.revoked_at && copy.identity.revoked}
                    </h4>
                    <p>
                      {copy.identity.validity(
                        date(item.valid_from),
                        item.valid_until ? date(item.valid_until) : null,
                      )}
                    </p>
                    {item.revoked_at && <p>{copy.identity.revokedOn(date(item.revoked_at))}</p>}
                    <p className="whitespace-pre-wrap break-words">
                      {copy.identity.evidence(item.evidence)}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </TabsContent>
        <TabsContent value="registrations" className="mt-4 space-y-4">
          <p>
            {copy.registrations.showing(data.registrations.length, coverage.registration_total)}
          </p>
          {data.registrations.length === 0 ? (
            <p className={card}>{copy.registrations.none}</p>
          ) : (
            data.registrations.map((item) => (
              <article key={item.id} className={card}>
                <h3 className="font-semibold">{item.title}</h3>
                <p>
                  {date(item.starts_at)} · {label(registrationLabels, item.status)}
                </p>
                <p>
                  {copy.registrations.attendanceLine(
                    label(attendanceLabels, item.attendance_status),
                    item.volunteer_hours,
                  )}
                </p>
                <a
                  className={action}
                  href={`/admin/volunteers/registrations/${encodeURIComponent(item.id)}`}
                >
                  {copy.registrations.view}
                </a>
              </article>
            ))
          )}
        </TabsContent>
        <TabsContent value="attendance" className="mt-4 space-y-4">
          <p>
            {copy.attendance.showing(
              data.attendance_events.length,
              coverage.attendance_event_total,
            )}
          </p>
          {data.attendance_events.length === 0 ? (
            <p className={card}>{copy.attendance.none}</p>
          ) : (
            data.attendance_events.map((item) => (
              <article key={item.id} className={card}>
                <h3 className="font-semibold">
                  {item.command === "correct" ? copy.attendance.correction : copy.attendance.record}{" "}
                  · {date(item.recorded_at)}
                </h3>
                <p>
                  {copy.attendance.before}
                  <AttendanceFact fact={item.before_fact} />
                </p>
                <p>
                  {copy.attendance.after}
                  <AttendanceFact fact={item.after_fact} />
                </p>
                <p className="whitespace-pre-wrap break-words">
                  {copy.attendance.reason(item.reason)}
                </p>
                <a
                  className={action}
                  href={`/admin/volunteers/registrations/${encodeURIComponent(item.registration_id)}`}
                >
                  {copy.attendance.related}
                </a>
              </article>
            ))
          )}
        </TabsContent>
        <TabsContent value="audit" className="mt-4 space-y-4">
          <p>
            {copy.audit.showing(
              data.verification_history.length,
              coverage.verification_event_total,
            )}
          </p>
          {data.verification_history.length === 0 ? (
            <p className={card}>{copy.audit.none}</p>
          ) : (
            data.verification_history.map((item) => (
              <article key={item.id} className={card}>
                <h3 className="font-semibold">{date(item.created_at)}</h3>
                <p>{label(copy.audit.events, item.event_type)}</p>
                <p className="whitespace-pre-wrap break-words">
                  {item.reason || copy.audit.noReason}
                </p>
                <p className="break-all text-xs">{copy.audit.handledBy(item.actor_user_id)}</p>
              </article>
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
export function VolunteerPersonDetail({
  profileId,
  search,
}: {
  profileId: string;
  search: DirectorySearch;
}) {
  const { copy } = usePersonText();
  const query = useQuery({
    queryKey: ["volunteer-directory", "person", profileId],
    queryFn: () =>
      fetchAdminJson<DirectoryDetail>(
        `/api/admin/volunteers/people?profile_id=${encodeURIComponent(profileId)}`,
      ),
  });
  if (query.isPending) return <p role="status">{copy.loading}</p>;
  if (query.isError)
    return (
      <div role="alert" className={card}>
        <p>{copy.loadFailed}</p>
        <button className={action} onClick={() => void query.refetch()}>
          {copy.reload}
        </button>
        <a className={action} href={`/admin/volunteers/people?${directoryQuery(search)}`}>
          {copy.back}
        </a>
      </div>
    );
  return <PersonRecords data={query.data} search={search} />;
}
