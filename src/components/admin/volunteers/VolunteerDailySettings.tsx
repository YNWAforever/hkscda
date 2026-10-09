import { useUnsavedVolunteerDraft } from "./useUnsavedVolunteerDraft";
import { PolicyChangeSummary } from "./PolicyChangeSummary";
import { WorkflowSections } from "./WorkflowSections";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { policyReason, type PolicyReasonCode } from "../../../lib/volunteers/policy/messages";
import { getPolicyReadiness, type PolicyDraft } from "../../../lib/volunteers/policy/schemas";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { dailySettingsCopy, type DailyNotice } from "./dailySettingsCopy";
import { policyCommonCopy } from "./policyCommonCopy";
import { policyFormatCopy } from "./policyFormatCopy";
type Daily = PolicyDraft["daily_limits"][number];
type Binding = {
  scope_key: string;
  service_date: string;
  revision: number;
  body: Daily;
  release_rules: PolicyDraft["release_rules"];
  timezone: string;
  policy_body: PolicyDraft;
  activities: { id: string; title: string; starts_at: string }[];
};
type Listing = { bindings: Binding[]; credentials: { key: string; label: string }[] };
export type DailyPreview = {
  preview_id: string;
  occupied: number;
  before: Daily;
  after: Daily;
  activity_ids: string[];
};
/**
 * Where the screen starts, for a test or a preview of the screen. In the browser the screen starts
 * with nothing chosen and fills itself from the date the staff member picks, so nothing passes this.
 */
export type DailySettingsInitial = {
  selection?: string;
  draft?: PolicyDraft;
  dirty?: boolean;
  preview?: DailyPreview;
  notice?: DailyNotice;
};
const api = <T,>(body: object) =>
  fetchAdminJson<T>("/api/admin/volunteers/daily-settings", {
    method: "POST",
    body: JSON.stringify(body),
  });
const input =
  "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm";
const button =
  "min-h-11 rounded-md border border-[var(--color-border)] px-4 py-2 text-sm font-semibold disabled:opacity-50";
const tiers = ["newcomer", "regular", "senior"] as const;
const days = [0, 1, 2, 3, 4, 5, 6];
/** A setting left undecided; the reason is the stored zh-HK text, which the screen names in either language. */
const undecided = (code: PolicyReasonCode) => ({
  state: "unresolved" as const,
  reason: policyReason(code),
});
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
export function VolunteerDailySettings({ initial }: { initial?: DailySettingsInitial } = {}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(dailySettingsCopy, language);
  const common = pickAdminCopy(policyCommonCopy, language);
  const format = pickAdminCopy(policyFormatCopy, language);
  const qc = useQueryClient();
  const listing = useQuery({
    queryKey: ["volunteer-daily-settings"],
    queryFn: () => api<Listing>({ action: "list" }),
  });
  const [selection, setSelection] = useState(initial?.selection ?? "");
  const [draft, setDraft] = useState<PolicyDraft | undefined>(initial?.draft);
  const [dirty, setDirty] = useState(initial?.dirty ?? false);
  const [preview, setPreview] = useState<DailyPreview | undefined>(initial?.preview);
  const [publishKey, setPublishKey] = useState("");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState<DailyNotice | undefined>(initial?.notice);
  const binding = listing.data?.bindings.find(
    (b) => `${b.scope_key}|${b.service_date}` === selection,
  );
  useEffect(() => {
    if (binding) {
      setDraft(structuredClone(binding.policy_body));
      setDirty(false);
      setPreview(undefined);
      setReason("");
    }
  }, [binding]);
  useUnsavedVolunteerDraft(dirty);
  const quota = draft?.daily_limits.find((q) => q.key === binding?.body.key);
  const edit = (change: (p: PolicyDraft) => void) => {
    if (!draft) return;
    const next = structuredClone(draft);
    change(next);
    setDraft(next);
    setDirty(true);
    setPreview(undefined);
    setNotice(undefined);
  };
  const editQuota = (change: (q: Daily) => void) =>
    edit((p) => {
      const q = p.daily_limits.find((q) => q.key === binding?.body.key);
      if (q) change(q);
    });
  const readiness = draft ? getPolicyReadiness(draft, language) : undefined;
  const pre = useMutation({
    mutationFn: () =>
      api<DailyPreview>({
        action: "preview",
        scope_key: binding!.scope_key,
        service_date: binding!.service_date,
        expected_revision: binding!.revision,
        body: draft,
      }),
    onSuccess: (p) => {
      setPreview(p);
      setPublishKey(crypto.randomUUID());
      setNotice("preview_updated");
    },
  });
  const publish = useMutation({
    mutationFn: () =>
      api({
        action: "publish",
        preview_id: preview!.preview_id,
        idempotency_key: publishKey,
        reason,
      }),
    onSuccess: () => {
      setDirty(false);
      setPreview(undefined);
      setNotice("published");
      void qc.invalidateQueries({ queryKey: ["volunteer-daily-settings"] });
      void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
      void qc.invalidateQueries({ queryKey: ["volunteer-calendar"] });
    },
    onError: () => setPreview(undefined),
  });
  const error = listing.error ?? pre.error ?? publish.error;
  const lookups = {
    credentials: Object.fromEntries((listing.data?.credentials ?? []).map((c) => [c.key, c.label])),
  };
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro}</p>
        <a className="underline" href="/admin/volunteers/settings">
          {copy.back}
        </a>
      </header>
      <WorkflowSections
        sections={[
          { id: "daily-quota", label: copy.sections.quota },
          { id: "daily-release", label: copy.sections.release },
          { id: "daily-publish", label: copy.sections.publish },
        ]}
      />
      {listing.isLoading && <p>{copy.loading}</p>}
      {error && <p role="alert">{volunteerAdminErrorMessage(error, language) ?? copy.failed}</p>}
      {notice && <p role="status">{copy.notices[notice]}</p>}
      <span id="daily-quota" />
      <Field label={copy.choose}>
        <select
          className={input}
          value={selection}
          disabled={dirty || publish.isPending}
          onChange={(e) => setSelection(e.target.value)}
        >
          <option value="">{copy.pleaseChoose}</option>
          {listing.data?.bindings.map((b) => (
            <option
              key={`${b.scope_key}|${b.service_date}`}
              value={`${b.scope_key}|${b.service_date}`}
            >
              {copy.option(
                format.day(b.service_date),
                copy.scopeName(b.scope_key),
                b.body.tiers.map((t) => common.tiers[t]).join(copy.tierSeparator),
              )}
            </option>
          ))}
        </select>
      </Field>
      {listing.data?.bindings.length === 0 && <p>{copy.none}</p>}
      {binding && quota && draft && (
        <>
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h2 className="text-lg font-bold">
              {copy.heading(format.day(binding.service_date), binding.revision, dirty)}
            </h2>
            <p>
              {copy.current(
                copy.limit(binding.body.maximum.state, valueOf(binding.body.maximum)),
                binding.activities.length,
              )}
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={copy.fields.mode}>
                <select
                  className={input}
                  value={quota.maximum.state}
                  onChange={(e) =>
                    editQuota((q) => {
                      q.maximum =
                        e.target.value === "unlimited"
                          ? { state: "unlimited" }
                          : {
                              state: "value",
                              value: q.maximum.state === "value" ? q.maximum.value : 0,
                            };
                    })
                  }
                >
                  <option value="value">{copy.fields.modeOptions.value}</option>
                  <option value="unlimited">{copy.fields.modeOptions.unlimited}</option>
                </select>
              </Field>
              <Field label={copy.fields.places}>
                <input
                  className={input}
                  type="number"
                  min={0}
                  max={100000}
                  disabled={quota.maximum.state !== "value"}
                  value={quota.maximum.state === "value" ? quota.maximum.value : ""}
                  onChange={(e) =>
                    editQuota((q) => {
                      q.maximum = { state: "value", value: Number(e.target.value) };
                    })
                  }
                />
              </Field>
              <Field label={copy.fields.counting}>
                <select
                  className={input}
                  value={typeof quota.count_mode === "string" ? quota.count_mode : "unresolved"}
                  onChange={(e) =>
                    editQuota((q) => {
                      q.count_mode =
                        e.target.value === "distinct_people" ? "distinct_people" : "attendances";
                    })
                  }
                >
                  <option value="unresolved" disabled>
                    {copy.fields.countingOptions.undecided}
                  </option>
                  <option value="distinct_people">
                    {copy.fields.countingOptions.distinct_people}
                  </option>
                  <option value="attendances">{copy.fields.countingOptions.attendances}</option>
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">{copy.fields.tiers}</legend>
              {tiers.map((t) => (
                <label className="mr-4 inline-flex min-h-11 items-center gap-2" key={t}>
                  <input
                    type="checkbox"
                    checked={quota.tiers.includes(t)}
                    onChange={(e) =>
                      editQuota((q) => {
                        q.tiers = e.target.checked
                          ? [...q.tiers, t]
                          : q.tiers.filter((v) => v !== t);
                      })
                    }
                  />
                  {common.tiers[t]}
                </label>
              ))}
            </fieldset>
            <label className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={quota.include_group_visitors === true}
                onChange={(e) =>
                  editQuota((q) => {
                    q.include_group_visitors = e.target.checked;
                  })
                }
              />
              {copy.fields.groupVisitors}
            </label>
          </section>
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h2 id="daily-release" className="text-lg font-bold">
              {copy.release.title}
            </h2>
            <p className="text-sm">{copy.release.text}</p>
            {draft.release_rules.map((r, i) =>
              !("state" in r) &&
              r.action.type === "relax_quota" &&
              r.action.scope === quota.scope &&
              r.action.quota === quota.key ? (
                <div key={r.key} className="space-y-3 rounded-md border p-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label={copy.release.semantics}>
                      <select
                        className={input}
                        value={typeof r.semantics === "string" ? r.semantics : ""}
                        onChange={(e) =>
                          edit((p) => {
                            const x = p.release_rules[i];
                            if (!("state" in x))
                              x.semantics =
                                e.target.value === "once"
                                  ? "once"
                                  : e.target.value === "dynamic"
                                    ? "dynamic"
                                    : undecided("pick_release_semantics");
                          })
                        }
                      >
                        <option value="">{copy.release.semanticsOptions.notSet}</option>
                        <option value="dynamic">{copy.release.semanticsOptions.dynamic}</option>
                        <option value="once">{copy.release.semanticsOptions.once}</option>
                      </select>
                    </Field>
                    <Field label={copy.release.hours}>
                      <input
                        className={input}
                        type="number"
                        min={0}
                        value={r.within_hours}
                        onChange={(e) =>
                          edit((p) => {
                            const x = p.release_rules[i];
                            if (!("state" in x)) x.within_hours = Number(e.target.value);
                          })
                        }
                      />
                    </Field>
                    <Field label={copy.release.anchor}>
                      <select
                        className={input}
                        value={
                          typeof r.action.daily_anchor === "string"
                            ? r.action.daily_anchor
                            : "unresolved"
                        }
                        onChange={(e) =>
                          edit((p) => {
                            const x = p.release_rules[i];
                            if (!("state" in x) && x.action.type === "relax_quota")
                              x.action.daily_anchor =
                                e.target.value === "first_session" ||
                                e.target.value === "last_session"
                                  ? e.target.value
                                  : undecided("pick_daily_anchor");
                          })
                        }
                      >
                        <option value="unresolved">{copy.release.anchorOptions.unresolved}</option>
                        <option value="first_session">
                          {copy.release.anchorOptions.first_session}
                        </option>
                        <option value="last_session">
                          {copy.release.anchorOptions.last_session}
                        </option>
                      </select>
                    </Field>
                    <Field label={copy.release.operator}>
                      <select
                        className={input}
                        value={r.condition.operator}
                        onChange={(e) =>
                          edit((p) => {
                            const x = p.release_rules[i];
                            if (!("state" in x))
                              x.condition.operator = e.target.value === "lte" ? "lte" : "lt";
                          })
                        }
                      >
                        <option value="lt">{copy.release.operatorOptions.lt}</option>
                        <option value="lte">{copy.release.operatorOptions.lte}</option>
                      </select>
                    </Field>
                    <Field label={copy.release.threshold}>
                      <input
                        className={input}
                        type="number"
                        min={0}
                        value={
                          typeof r.condition.threshold === "number" ? r.condition.threshold : ""
                        }
                        onChange={(e) =>
                          edit((p) => {
                            const x = p.release_rules[i];
                            if (!("state" in x)) x.condition.threshold = Number(e.target.value);
                          })
                        }
                      />
                    </Field>
                  </div>
                  <fieldset>
                    <legend>{copy.release.thresholdTiers}</legend>
                    {tiers.map((t) => (
                      <label key={t} className="mr-4 inline-flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.condition.tiers.includes(t)}
                          onChange={(e) =>
                            edit((p) => {
                              const x = p.release_rules[i];
                              if (!("state" in x))
                                x.condition.tiers = e.target.checked
                                  ? [...x.condition.tiers, t]
                                  : x.condition.tiers.filter((v) => v !== t);
                            })
                          }
                        />
                        {common.tiers[t]}
                      </label>
                    ))}
                  </fieldset>
                  <Field label={copy.release.newMaximum}>
                    <input
                      className={input}
                      type="number"
                      min={0}
                      max={100000}
                      value={r.action.new_maximum}
                      onChange={(e) =>
                        edit((p) => {
                          const x = p.release_rules[i];
                          if (!("state" in x) && x.action.type === "relax_quota")
                            x.action.new_maximum = Number(e.target.value);
                        })
                      }
                    />
                  </Field>
                  <fieldset>
                    <legend>{copy.release.receivingTiers}</legend>
                    {quota.tiers.map((t) => (
                      <label key={t} className="mr-4 inline-flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.allowed_tiers.includes(t)}
                          onChange={(e) =>
                            edit((p) => {
                              const x = p.release_rules[i];
                              if (!("state" in x))
                                x.allowed_tiers = e.target.checked
                                  ? [...x.allowed_tiers, t]
                                  : x.allowed_tiers.filter((v) => v !== t);
                            })
                          }
                        />
                        {common.tiers[t]}
                      </label>
                    ))}
                  </fieldset>
                  <Field label={copy.release.credentialMode}>
                    <select
                      className={input}
                      value={r.credentials.mode}
                      onChange={(e) =>
                        edit((p) => {
                          const x = p.release_rules[i];
                          if (!("state" in x))
                            x.credentials.mode = e.target.value === "any" ? "any" : "all";
                        })
                      }
                    >
                      <option value="all">{copy.release.credentialModeOptions.all}</option>
                      <option value="any">{copy.release.credentialModeOptions.any}</option>
                    </select>
                  </Field>
                  <fieldset>
                    <legend>{copy.release.credentials}</legend>
                    {listing.data?.credentials.map((c) => (
                      <label key={c.key} className="mr-4 inline-flex min-h-11 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={r.credentials.keys.includes(c.key)}
                          onChange={(e) =>
                            edit((p) => {
                              const x = p.release_rules[i];
                              if (!("state" in x))
                                x.credentials.keys = e.target.checked
                                  ? [...x.credentials.keys, c.key]
                                  : x.credentials.keys.filter((v) => v !== c.key);
                            })
                          }
                        />
                        {c.label}
                      </label>
                    ))}
                  </fieldset>
                  <Field label={copy.release.weekdayMode}>
                    <select
                      className={input}
                      value={Array.isArray(r.weekdays) ? "override" : "preserve"}
                      onChange={(e) =>
                        edit((p) => {
                          const x = p.release_rules[i];
                          if (!("state" in x))
                            x.weekdays =
                              e.target.value === "override" ? [0, 1, 2, 3, 4, 5, 6] : "preserve";
                        })
                      }
                    >
                      <option value="preserve">{copy.release.weekdayModeOptions.preserve}</option>
                      <option value="override">{copy.release.weekdayModeOptions.override}</option>
                    </select>
                  </Field>
                  {Array.isArray(r.weekdays) && (
                    <fieldset>
                      <legend>{copy.release.weekdays}</legend>
                      {days.map((n) => (
                        <label key={n} className="mr-3 inline-flex min-h-11 items-center gap-2">
                          <input
                            type="checkbox"
                            checked={Array.isArray(r.weekdays) && r.weekdays.includes(n)}
                            onChange={(e) =>
                              edit((p) => {
                                const x = p.release_rules[i];
                                if (!("state" in x) && Array.isArray(x.weekdays))
                                  x.weekdays = e.target.checked
                                    ? [...x.weekdays, n]
                                    : x.weekdays.filter((v) => v !== n);
                              })
                            }
                          />
                          {common.weekday(n)}
                        </label>
                      ))}
                    </fieldset>
                  )}
                  <button
                    className={button}
                    onClick={() =>
                      edit((p) => {
                        p.release_rules.splice(i, 1);
                      })
                    }
                  >
                    {copy.release.remove}
                  </button>
                </div>
              ) : null,
            )}
            <button
              className={button}
              onClick={() =>
                edit((p) => {
                  p.release_rules.push({
                    key: `daily_release_${crypto.randomUUID().slice(0, 8)}`,
                    priority:
                      Math.max(0, ...p.release_rules.map((r) => ("state" in r ? 0 : r.priority))) +
                      1,
                    within_hours: 48,
                    condition: {
                      tiers: ["regular", "senior"],
                      operator: "lt",
                      threshold: undecided("enter_experienced_threshold"),
                    },
                    action: {
                      type: "relax_quota",
                      quota: quota.key,
                      scope: quota.scope,
                      new_maximum:
                        p.capacity.volunteers.state === "value" ? p.capacity.volunteers.value : 1,
                      daily_anchor: undecided("pick_first_or_last"),
                    },
                    allowed_tiers: [...quota.tiers],
                    credentials: { mode: "all", keys: [] },
                    weekdays: "preserve",
                  });
                })
              }
            >
              {copy.release.add}
            </button>
          </section>
          {readiness && !readiness.ready && (
            <ul role="alert">
              {readiness.issues.map((x) => (
                <li key={x.path}>{x.message}</li>
              ))}
            </ul>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              className={button}
              disabled={!readiness?.ready || pre.isPending || publish.isPending}
              onClick={() => pre.mutate()}
            >
              {copy.preview}
            </button>
            <button
              className={button}
              disabled={publish.isPending}
              onClick={() => {
                setDraft(structuredClone(binding.policy_body));
                setDirty(false);
                setPreview(undefined);
              }}
            >
              {copy.discard}
            </button>
          </div>
          {preview && (
            <section className="space-y-4 rounded-lg border bg-white p-4">
              <h2 id="daily-publish" className="text-lg font-bold">
                {copy.publish.title}
              </h2>
              <PolicyChangeSummary
                before={preview.before}
                after={preview.after}
                lookups={lookups}
              />
              <p>
                {copy.publish.summary(
                  copy.limit(preview.before.maximum.state, valueOf(preview.before.maximum)),
                  copy.limit(preview.after.maximum.state, valueOf(preview.after.maximum)),
                  preview.occupied,
                  preview.activity_ids.length,
                )}
              </p>
              <ul>
                {binding.activities
                  .filter((a) => preview.activity_ids.includes(a.id))
                  .map((a) => (
                    <li key={a.id}>
                      {a.title} · {format.dailyClock(a.starts_at, binding.timezone)}
                    </li>
                  ))}
              </ul>
              <Field label={copy.publish.reason}>
                <textarea
                  className={input}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <button
                className={button}
                disabled={!reason.trim() || publish.isPending}
                onClick={() => publish.mutate()}
              >
                {copy.publish.confirm}
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
/** The number in a limit that has one. */
function valueOf(limit: Daily["maximum"]): number | undefined {
  return limit.state === "value" ? limit.value : undefined;
}
