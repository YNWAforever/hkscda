import { useCallback, useEffect, useState } from "react";
import { fetchAdminJson } from "../../../lib/admin/http";
import { hkDate } from "../../../lib/volunteers/bulk/service";
import { initialMonthlyPolicy } from "../../../lib/volunteers/policy/catalogue";
import { monthlyPolicySchema } from "../../../lib/volunteers/policy/schemas";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { assessmentsCopy, type AssessmentMessage } from "./assessmentsCopy";
import { assessmentMessageText } from "./assessmentsLogic";
import { policyFormatCopy } from "./policyFormatCopy";
import { WorkflowSections } from "./WorkflowSections";
import { LoadFailure } from "../LoadFailure";
type P = typeof initialMonthlyPolicy;
export type AssessmentJob = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  available_at: string;
  last_error: string | null;
};
export type AssessmentListing = {
  available_channels?: string[];
  senior_candidates?: Array<{
    id: string;
    profile_id: string;
    trigger_kind: string;
    detected_at: string;
    profile?: { display_name?: string } | null;
  }>;
  draft?: { body: P; revision: number };
  versions?: Array<{ id: string; effective_from: string; reason: string }>;
  assessments?: Array<{
    id: string;
    period_start: string;
    scope_key: string;
    completed_at: string;
  }>;
};
/**
 * Where the page starts, for a test or a preview of the page. In the browser it starts with the
 * catalogue's settings and fills itself from the saved draft, so nothing passes this.
 */
export type AssessmentsInitial = {
  policy?: P;
  revision?: number;
  data?: AssessmentListing;
  jobs?: AssessmentJob[];
  message?: AssessmentMessage;
  scope?: string;
};
const c = "min-h-10 rounded-md border px-2 py-1.5";
type AssessmentApiResult = AssessmentListing & {
  draft: { body: P; revision: number };
  ready?: boolean;
  profiles?: number;
};
async function cmd(x: unknown) {
  return fetchAdminJson<AssessmentApiResult>("/api/admin/volunteers/assessments/", {
    method: "POST",
    body: JSON.stringify(x),
  });
}
export function VolunteerAssessments({
  initial,
  now = () => new Date(),
}: {
  initial?: AssessmentsInitial;
  /** The clock that gives the effective date its starting value: the Hong Kong date of the moment it reads. */
  now?: () => Date;
} = {}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(assessmentsCopy, language);
  const format = pickAdminCopy(policyFormatCopy, language);
  const [p, setP] = useState<P>(initial?.policy ?? initialMonthlyPolicy),
    [rev, setRev] = useState(initial?.revision ?? 0),
    [data, setData] = useState<AssessmentListing>(initial?.data ?? {}),
    [message, setMessage] = useState<AssessmentMessage | undefined>(initial?.message),
    [reason, setReason] = useState(""),
    [effective, setEffective] = useState(hkDate(now())),
    [month, setMonth] = useState(""),
    [scope, setScope] = useState(initial?.scope ?? "combined"),
    [jobs, setJobs] = useState<AssessmentJob[]>(initial?.jobs ?? []),
    // The error of loading the page, kept apart from the message of an action so it can be retried.
    [loadError, setLoadError] = useState<{ cause: unknown } | undefined>(undefined);
  const fail = (cause: unknown) => setMessage({ code: "error", cause });
  // Only state setters, which never change, are used here, so loading once on mount depends on nothing.
  const load = useCallback(
    () =>
      cmd({ kind: "list" })
        .then((x) => {
          setLoadError(undefined);
          setData(x);
          if (x.draft) {
            setP(monthlyPolicySchema.parse(x.draft.body));
            setRev(x.draft.revision);
          }
        })
        .catch((cause: unknown) => setLoadError({ cause })),
    [],
  );
  const loadJobs = () =>
    fetchAdminJson<{ jobs: AssessmentJob[] }>("/api/admin/volunteers/jobs/").then((x) =>
      setJobs(x.jobs),
    );
  useEffect(() => {
    void load();
  }, [load]);
  const change = <K extends keyof P>(k: K, v: P[K]) => setP((q) => ({ ...q, [k]: v }));
  const value = (v: unknown) => (typeof v === "string" ? v : "");
  const text = message ? assessmentMessageText(message, language) : "";
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <WorkflowSections
          sections={[
            { id: "assessment-settings", label: copy.sections.settings },
            { id: "assessment-run", label: copy.sections.run },
            { id: "assessment-candidates", label: copy.sections.candidates },
            { id: "assessment-notifications", label: copy.sections.notifications },
          ]}
        />
        <span id="assessment-settings" />
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
      </header>
      <section className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-3">
        <label>
          {copy.fields.regularThreshold}
          <input
            className={c}
            type="number"
            value={p.regular_attendance_threshold}
            onChange={(e) => change("regular_attendance_threshold", +e.target.value)}
          />
        </label>
        <label>
          {copy.fields.seniorYears}
          <input
            className={c}
            type="number"
            value={p.senior_years}
            onChange={(e) => change("senior_years", +e.target.value)}
          />
        </label>
        <label>
          {copy.fields.observationMonths}
          <input
            className={c}
            type="number"
            value={
              typeof p.senior_regular_observation_months === "number"
                ? p.senior_regular_observation_months
                : ""
            }
            onChange={(e) => change("senior_regular_observation_months", +e.target.value)}
          />
        </label>
        <label>
          {copy.fields.attendanceUnit}
          <select
            className={c}
            value={value(p.attendance_unit)}
            onChange={(e) => change("attendance_unit", e.target.value as P["attendance_unit"])}
          >
            <option value="">{copy.undecided}</option>
            <option value="once_per_day">{copy.attendanceUnitOptions.once_per_day}</option>
            <option value="each_verified_nonoverlapping_session">
              {copy.attendanceUnitOptions.each_verified_nonoverlapping_session}
            </option>
          </select>
        </label>
        <label>
          {copy.fields.shelterScope}
          <select
            className={c}
            value={value(p.shelter_scope)}
            onChange={(e) => change("shelter_scope", e.target.value as P["shelter_scope"])}
          >
            <option value="">{copy.undecided}</option>
            <option value="combined">{copy.shelterScopeOptions.combined}</option>
            <option value="separate">{copy.shelterScopeOptions.separate}</option>
          </select>
        </label>
        <label>
          {copy.fields.promotionTrigger}
          <select
            className={c}
            value={value(p.promotion_trigger)}
            onChange={(e) => change("promotion_trigger", e.target.value as P["promotion_trigger"])}
          >
            <option value="">{copy.undecided}</option>
            <option value="verified_attendance">
              {copy.promotionTriggerOptions.verified_attendance}
            </option>
            <option value="monthly_assessment">
              {copy.promotionTriggerOptions.monthly_assessment}
            </option>
          </select>
        </label>
        <label>
          {copy.fields.regularMinimum}
          <input
            className={c}
            type="number"
            value={p.regular_monthly_minimum}
            onChange={(e) => change("regular_monthly_minimum", +e.target.value)}
          />
        </label>
        <label>
          {copy.fields.seniorMinimum}
          <input
            className={c}
            type="number"
            value={p.senior_monthly_minimum}
            onChange={(e) => change("senior_monthly_minimum", +e.target.value)}
          />
        </label>
        <label>
          {copy.fields.regularZeroMonths}
          <input
            className={c}
            type="number"
            value={p.regular_zero_months}
            onChange={(e) => change("regular_zero_months", +e.target.value)}
          />
        </label>
        <label>
          {copy.fields.seniorZeroMonths}
          <input
            className={c}
            type="number"
            value={p.senior_zero_months}
            onChange={(e) => change("senior_zero_months", +e.target.value)}
          />
        </label>
        <label>
          {copy.fields.assessmentDay}
          <input
            className={c}
            type="number"
            min="1"
            max="31"
            value={p.assessment_day}
            onChange={(e) => change("assessment_day", +e.target.value)}
          />
        </label>
        <label>
          {copy.fields.assessmentTime}
          <input
            className={c}
            type="time"
            value={value(p.assessment_time)}
            onChange={(e) => change("assessment_time", e.target.value as P["assessment_time"])}
          />
        </label>
        <label className="md:col-span-3">
          {copy.fields.regularTemplate}
          <textarea
            className={c + " w-full"}
            value={p.notifications.regular_template}
            onChange={(e) =>
              change("notifications", { ...p.notifications, regular_template: e.target.value })
            }
          />
        </label>
        <label className="md:col-span-3">
          {copy.fields.seniorTemplate}
          <textarea
            className={c + " w-full"}
            value={p.notifications.senior_template}
            onChange={(e) =>
              change("notifications", { ...p.notifications, senior_template: e.target.value })
            }
          />
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.notifications.enabled}
            onChange={(e) =>
              change("notifications", {
                ...p.notifications,
                enabled: e.target.checked,
              })
            }
          />{" "}
          {copy.fields.queueEnabled}
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.notifications.channels.includes("email")}
            disabled={!p.notifications.dry_run && !data.available_channels?.includes("email")}
            onChange={(e) =>
              change("notifications", {
                ...p.notifications,
                channels: e.target.checked ? ["email"] : [],
              })
            }
          />{" "}
          {data.available_channels?.includes("email")
            ? copy.fields.emailConfigured
            : copy.fields.emailNotConfigured}
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.notifications.dry_run}
            onChange={(e) =>
              change("notifications", { ...p.notifications, dry_run: e.target.checked })
            }
          />{" "}
          {copy.fields.dryRun}
        </label>
      </section>
      <div className="flex flex-wrap gap-2">
        <button
          className={c}
          onClick={() =>
            cmd({ kind: "save", body: p, expected_revision: rev })
              .then((x) => {
                setRev(x.draft.revision);
                setMessage({ code: "draft_saved" });
              })
              .catch(fail)
          }
        >
          {copy.save}
        </button>
        <button
          className={c}
          onClick={() =>
            cmd({ kind: "preview" })
              .then((x) => setMessage({ code: x.ready ? "preview_ready" : "preview_blocked" }))
              .catch(fail)
          }
        >
          {copy.preview}
        </button>
        <input
          className={c}
          type="date"
          aria-label={copy.effectiveLabel}
          value={effective}
          onChange={(e) => setEffective(e.target.value)}
        />
        <input
          className={c}
          placeholder={copy.reasonLabel}
          aria-label={copy.reasonLabel}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className={c}
          disabled={!reason || !rev}
          onClick={() =>
            cmd({ kind: "publish", expected_revision: rev, effective_from: effective, reason })
              .then(() => {
                setMessage({ code: "published" });
                load();
              })
              .catch(fail)
          }
        >
          {copy.publish}
        </button>
      </div>
      <section className="rounded-lg border bg-white p-4">
        <h2 id="assessment-run" className="font-bold">
          {copy.run.title}
        </h2>
        <input
          className={c}
          type="month"
          aria-label={copy.run.monthLabel}
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <select
          aria-label={copy.run.scopeLabel}
          className={c}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="combined">{copy.run.scopes.combined}</option>
          <option value="cat">{copy.run.scopes.cat}</option>
          <option value="dog">{copy.run.scopes.dog}</option>
        </select>
        <button
          className={c}
          disabled={!month}
          onClick={() =>
            cmd({ kind: "run", period_start: month + "-01", scope_key: scope })
              .then((x) => {
                setMessage({ code: "run_done", profiles: x.profiles });
                load();
              })
              .catch(fail)
          }
        >
          {copy.run.button}
        </button>
        <ul className="mt-2 text-sm">
          {data.assessments?.map((a) => (
            <li key={a.id}>
              {copy.run.line(format.day(a.period_start), copy.run.scopeName(a.scope_key))}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 id="assessment-candidates" className="font-bold">
          {copy.candidates.title}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.candidates.text}</p>
        <ul className="mt-2 text-sm">
          {data.senior_candidates?.map((candidate) => (
            <li key={candidate.id}>
              {copy.candidates.line(
                candidate.profile?.display_name ?? copy.candidates.unnamed,
                candidate.trigger_kind === "verified_attendance"
                  ? copy.candidates.triggers.verified_attendance
                  : copy.candidates.triggers.other,
                format.storedMoment(candidate.detected_at),
              )}
            </li>
          ))}
        </ul>
      </section>{" "}
      <section className="rounded-lg border bg-white p-4">
        <h2 id="assessment-notifications" className="font-bold">
          {copy.notifications.title}
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.notifications.text}</p>
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                {copy.notifications.line(
                  copy.notifications.kind(job.kind),
                  copy.notifications.status(job.status),
                  job.attempts,
                )}
              </span>
              {job.last_error && (
                <span className="text-[var(--color-error)]">{job.last_error}</span>
              )}
              {job.status === "failed" && (
                <button
                  className={c}
                  onClick={() =>
                    fetchAdminJson(`/api/admin/volunteers/jobs/${job.id}/retry`, { method: "POST" })
                      .then(() => {
                        setMessage({ code: "requeued" });
                        void loadJobs();
                      })
                      .catch(fail)
                  }
                >
                  {copy.notifications.requeue}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {loadError ? (
        <LoadFailure
          error={loadError.cause}
          onRetry={() => void load()}
          title={assessmentMessageText({ code: "error", cause: loadError.cause }, language)}
        />
      ) : null}
      {text && <p role="status">{text}</p>}
    </div>
  );
}
