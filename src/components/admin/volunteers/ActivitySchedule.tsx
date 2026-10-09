import { addHkDays, generationDates, hkDate } from "../../../lib/volunteers/bulk/service";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { activityWorkspaceCopy } from "./activityWorkspaceCopy";
import type { Row } from "./activityWorkspaceTypes";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";

/** Which of the three arrangements an activity's group scenario is. */
function scenarioKey(scenario: string | null): "confirmed_group" | "no_confirmed_group" | "other" {
  return scenario === "confirmed_group" || scenario === "no_confirmed_group" ? scenario : "other";
}

export function ActivitySchedule({
  rows,
  view,
  from,
  until,
  ids,
  onToggle,
  onOpen,
  templateNames = {},
}: {
  rows: Row[];
  view: string;
  from?: string;
  until?: string;
  ids: string[];
  onToggle: (id: string, checked: boolean) => void;
  onOpen: (id: string) => void;
  /** The name of each template by its key, so English can show a name rather than a key. */
  templateNames?: Record<string, string>;
}) {
  const { language } = useAdminLanguage();
  const workspace = pickAdminCopy(activityWorkspaceCopy, language);
  const copy = workspace.schedule;
  const common = pickAdminCopy(volunteerCommonCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const states: Record<string, string> = workspace.states;
  const select = (r: Row) => (
    <input
      type="checkbox"
      aria-label={copy.select(format.sessionTime(r.starts_at), r.title)}
      checked={ids.includes(r.id)}
      onChange={(e) => onToggle(r.id, e.target.checked)}
    />
  );
  const status = (r: Row) => states[r.status] ?? common.unknown(r.status);
  const open = (r: Row) => (
    <button className="min-h-11 text-left font-semibold underline" onClick={() => onOpen(r.id)}>
      {r.title}
    </button>
  );
  if (view !== "calendar")
    return (
      <div className="overflow-x-auto" tabIndex={0} aria-label={copy.tableLabel}>
        <table className="w-full text-left text-sm">
          <thead>
            <tr>
              {[
                copy.columns.select,
                copy.columns.time,
                copy.columns.activity,
                copy.columns.policy,
                copy.columns.staffing,
                copy.columns.status,
              ].map((label) => (
                <th className="p-3" key={label}>
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-t border-[var(--color-border)]">
                <td className="p-3">{select(r)}</td>
                <td className="p-3 whitespace-nowrap">
                  {format.sessionTime(r.starts_at)}
                  {r.ends_at && <p>{copy.until(format.sessionTime(r.ends_at))}</p>}
                </td>
                <td className="p-3">
                  {open(r)}
                  <p>
                    {r.location} ·{" "}
                    {r.shelter_key === null ? copy.shelterUnset : common.shelterKey(r.shelter_key)}
                  </p>
                </td>
                <td className="p-3">
                  {r.template_key === null
                    ? copy.templateUnset
                    : copy.template(r.template_key, templateNames[r.template_key])}
                  <p>
                    {r.policy_version_id ? copy.policyVersion(r.policy_revision) : copy.policyUnset}
                  </p>
                  <p>{copy.scenarios[scenarioKey(r.scenario)]}</p>
                </td>
                <td className="p-3">
                  {copy.staffing(r.approved, r.capacity, r.waitlisted)}
                  {r.shortages.map((s) => (
                    <p key={s.role}>{copy.shortage(s.role, s.missing)}</p>
                  ))}
                </td>
                <td className="p-3">
                  {status(r)}
                  {r.registrations_closed_at && <p>{copy.registrationsClosed}</p>}
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
    <section aria-label={copy.calendarLabel}>
      <p className="mb-3 text-sm">{copy.calendarNote}</p>
      <div className="hidden grid-cols-7 sm:grid" aria-hidden="true">
        {[0, 1, 2, 3, 4, 5, 6].map((day) => (
          <span className="p-2" key={day}>
            {copy.weekday(day)}
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
                  <p>{format.sessionTime(r.starts_at)}</p>
                  <p>
                    {r.shelter_key === null
                      ? r.location
                      : common.shelterKey(r.shelter_key, r.location)}{" "}
                    · {status(r)}
                  </p>
                  <p>{copy.cardStaffing(r.approved, r.waitlisted)}</p>
                  <p>
                    {r.policy_version_id ? copy.policyVersion(r.policy_revision) : copy.policyUnset}
                  </p>
                </article>
              ))}
          </section>
        ))}
      </div>
    </section>
  );
}
