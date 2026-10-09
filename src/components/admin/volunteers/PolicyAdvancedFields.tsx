import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { SourceListing } from "../../../lib/volunteers/policy/sourceService";
import { initialPolicyCatalogue } from "../../../lib/volunteers/policy/catalogue";
import { undecidedSetting } from "../../../lib/volunteers/policy/messages";
import type { PolicyDraft } from "../../../lib/volunteers/policy/schemas";
import { useAdminCopy } from "../i18n/copy";
import { policyAdvancedCopy } from "./policyAdvancedCopy";
import { policyCommonCopy } from "./policyCommonCopy";
import { newPolicyRole } from "./policyDefaults";
const input =
  "min-h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm";
const tiers = ["newcomer", "regular", "senior"] as const,
  days = [0, 1, 2, 3, 4, 5, 6];
type Limit = PolicyDraft["capacity"]["volunteers"];
type Window = PolicyDraft["booking"]["individual_open"];
function F({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <b className="block text-xs">{label}</b>
      {children}
    </label>
  );
}
function Tier({
  value,
  set,
}: {
  value: PolicyDraft["eligibility"]["allowed_tiers"];
  set: (v: PolicyDraft["eligibility"]["allowed_tiers"]) => void;
}) {
  const common = useAdminCopy(policyCommonCopy);
  return (
    <div>
      {tiers.map((t) => (
        <label key={t} className="mr-3 text-xs">
          <input
            type="checkbox"
            checked={value.includes(t)}
            onChange={(e) => set(e.target.checked ? [...value, t] : value.filter((x) => x !== t))}
          />{" "}
          {common.tiers[t]}
        </label>
      ))}
    </div>
  );
}
function Days({ value, set }: { value: number[]; set: (v: number[]) => void }) {
  const common = useAdminCopy(policyCommonCopy);
  return (
    <div>
      {days.map((i) => (
        <label key={i} className="mr-2 text-xs">
          <input
            type="checkbox"
            checked={value.includes(i)}
            onChange={(e) => set(e.target.checked ? [...value, i] : value.filter((x) => x !== i))}
          />{" "}
          {common.weekday(i)}
        </label>
      ))}
    </div>
  );
}
function Lim({ value, set }: { value: Limit; set: (v: Limit) => void }) {
  const copy = useAdminCopy(policyAdvancedCopy);
  const n = value.state === "value" ? value.value : 0;
  return (
    <div className="grid grid-cols-[1fr_6rem] gap-2">
      <select
        className={input}
        value={value.state}
        onChange={(e) =>
          set(
            e.target.value === "value"
              ? { state: "value", value: n }
              : e.target.value === "unlimited"
                ? { state: "unlimited" }
                : e.target.value === "inherit"
                  ? { state: "inherit" }
                  : undecidedSetting(),
          )
        }
      >
        <option value="value">{copy.limit.value}</option>
        <option value="unlimited">{copy.limit.unlimited}</option>
        <option value="inherit">{copy.limit.inherit}</option>
        <option value="unresolved">{copy.limit.unresolved}</option>
      </select>
      <input
        className={input}
        type="number"
        min={0}
        disabled={value.state !== "value"}
        value={n}
        onChange={(e) => set({ state: "value", value: Number(e.target.value) })}
      />
    </div>
  );
}
function Cred({
  value,
  set,
}: {
  value: PolicyDraft["eligibility"]["credentials"];
  set: (v: PolicyDraft["eligibility"]["credentials"]) => void;
}) {
  const copy = useAdminCopy(policyAdvancedCopy).credentials;
  const registry = useQuery({
    queryKey: ["volunteer-policy-sources"],
    queryFn: () =>
      fetchAdminJson<SourceListing>("/api/admin/volunteers/sources/", {
        method: "POST",
        body: JSON.stringify({ action: "list" }),
      }),
  });
  return (
    <div className="grid gap-2 sm:grid-cols-[8rem_1fr]">
      <select
        className={input}
        value={value.mode}
        onChange={(e) => set({ ...value, mode: e.target.value as "all" | "any" })}
      >
        <option value="all">{copy.all}</option>
        <option value="any">{copy.any}</option>
      </select>
      <div className="space-y-1">
        {registry.data?.credentials.map((c) => (
          <label key={c.key} className="block text-sm">
            <input
              type="checkbox"
              checked={value.keys.includes(c.key)}
              onChange={(e) =>
                set({
                  ...value,
                  keys: e.target.checked
                    ? [...value.keys, c.key]
                    : value.keys.filter((k) => k !== c.key),
                })
              }
            />{" "}
            {c.label}
          </label>
        ))}
        <a className="text-xs underline" href="/admin/volunteers/sources">
          {copy.add}
        </a>
      </div>
    </div>
  );
}
function Win({ value, set }: { value: Window; set: (v: Window) => void }) {
  const copy = useAdminCopy(policyAdvancedCopy).window;
  const state = "mode" in value ? value.mode : value.state,
    n = "value" in value ? value.value : 0;
  return (
    <div className="grid gap-2 sm:grid-cols-3">
      <select
        className={input}
        value={state}
        onChange={(e) => {
          const m = e.target.value;
          set(
            m === "hours_before"
              ? { mode: m, value: n }
              : m === "calendar_days_before"
                ? { mode: m, value: n, at: "00:00" }
                : m === "unrestricted" || m === "disabled"
                  ? { mode: m }
                  : m === "inherit"
                    ? { state: "inherit" }
                    : undecidedSetting(),
          );
        }}
      >
        <option value="hours_before">{copy.hours_before}</option>
        <option value="calendar_days_before">{copy.calendar_days_before}</option>
        <option value="unrestricted">{copy.unrestricted}</option>
        <option value="disabled">{copy.disabled}</option>
        <option value="inherit">{copy.inherit}</option>
        <option value="unresolved">{copy.unresolved}</option>
      </select>
      <input
        className={input}
        type="number"
        min={0}
        disabled={!(state === "hours_before" || state === "calendar_days_before")}
        value={n}
        onChange={(e) =>
          state === "hours_before"
            ? set({ mode: state, value: Number(e.target.value) })
            : state === "calendar_days_before" &&
              set({
                mode: state,
                value: Number(e.target.value),
                at: "mode" in value && value.mode === "calendar_days_before" ? value.at : "00:00",
              })
        }
      />
      <input
        className={input}
        type="time"
        disabled={state !== "calendar_days_before"}
        value={"mode" in value && value.mode === "calendar_days_before" ? value.at : "00:00"}
        onChange={(e) =>
          "mode" in value &&
          value.mode === "calendar_days_before" &&
          set({ ...value, at: e.target.value })
        }
      />
    </div>
  );
}
function ConfigBool({
  value,
  set,
}: {
  value: PolicyDraft["capacity"]["group_in_shared_total"];
  set: (v: PolicyDraft["capacity"]["group_in_shared_total"]) => void;
}) {
  const copy = useAdminCopy(policyAdvancedCopy).flag;
  const state = typeof value === "boolean" ? String(value) : value.state;
  return (
    <select
      className={input}
      value={state}
      onChange={(e) =>
        set(
          e.target.value === "true"
            ? true
            : e.target.value === "false"
              ? false
              : e.target.value === "inherit"
                ? { state: "inherit" }
                : undecidedSetting(),
        )
      }
    >
      <option value="true">{copy.true}</option>
      <option value="false">{copy.false}</option>
      <option value="inherit">{copy.inherit}</option>
      <option value="unresolved">{copy.unresolved}</option>
    </select>
  );
}
/**
 * `templates` are the templates a group situation can pair with: the saved drafts, which are data that
 * staff can rename, with the catalogue only where nothing is saved. The settings screen passes them.
 */
export function PolicyAdvancedFields({
  policy,
  onChange,
  templates = initialPolicyCatalogue,
}: {
  policy: PolicyDraft;
  onChange: (fn: (p: PolicyDraft) => void) => void;
  templates?: PolicyDraft[];
}) {
  const copy = useAdminCopy(policyAdvancedCopy);
  const addRole = () => onChange((p) => p.roles.push(newPolicyRole()));
  const addQuota = () =>
    onChange((p) =>
      p.tier_quotas.push({
        key: "new_quota",
        tiers: ["newcomer"],
        maximum: { state: "unlimited" },
        weekdays: [0, 1, 2, 3, 4, 5, 6],
      }),
    );
  const addDaily = () =>
    onChange((p) =>
      p.daily_limits.push({
        key: "new_daily_limit",
        tiers: ["newcomer"],
        maximum: { state: "unlimited" },
        scope: "shelter_day",
        count_mode: "distinct_people",
        include_group_visitors: false,
      }),
    );
  const addRelease = () =>
    onChange((p) =>
      p.release_rules.push({
        key: "new_release",
        priority: p.release_rules.length + 1,
        within_hours: 48,
        condition: { tiers: ["regular", "senior"], operator: "lt", threshold: 1 },
        action: { type: "release_reserved", pool: p.roles[0]?.key ?? "experienced", quantity: 1 },
        allowed_tiers: ["newcomer"],
        credentials: { mode: "all", keys: [] },
        weekdays: "preserve",
      }),
    );
  return (
    <div className="space-y-6">
      <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-3">
        <h2 className="text-lg font-bold md:col-span-3">{copy.capacity.title}</h2>
        <F label={copy.capacity.volunteers}>
          <Lim
            value={policy.capacity.volunteers}
            set={(v) =>
              onChange((p) => {
                p.capacity.volunteers = v;
              })
            }
          />
        </F>
        <F label={copy.capacity.visitors}>
          <Lim
            value={policy.capacity.visitors}
            set={(v) =>
              onChange((p) => {
                p.capacity.visitors = v;
              })
            }
          />
        </F>
        <F label={copy.capacity.sharedTotal}>
          <Lim
            value={policy.capacity.shared_total}
            set={(v) =>
              onChange((p) => {
                p.capacity.shared_total = v;
              })
            }
          />
        </F>
        <F label={copy.capacity.groupInSharedTotal}>
          <ConfigBool
            value={policy.capacity.group_in_shared_total}
            set={(v) =>
              onChange((p) => {
                p.capacity.group_in_shared_total = v;
              })
            }
          />
        </F>
        <F label={copy.capacity.groupSizeMode}>
          <select
            className={input}
            value={
              "state" in policy.capacity.group_size ? policy.capacity.group_size.state : "value"
            }
            onChange={(e) =>
              onChange((p) => {
                p.capacity.group_size =
                  e.target.value === "value"
                    ? { minimum: 0, maximum: 0 }
                    : e.target.value === "inherit"
                      ? { state: "inherit" }
                      : undecidedSetting();
              })
            }
          >
            <option value="value">{copy.capacity.groupSizeOptions.value}</option>
            <option value="inherit">{copy.capacity.groupSizeOptions.inherit}</option>
            <option value="unresolved">{copy.capacity.groupSizeOptions.unresolved}</option>
          </select>
        </F>
        {"state" in policy.capacity.group_size ? null : (
          <>
            <F label={copy.capacity.groupMinimum}>
              <input
                className={input}
                type="number"
                min={0}
                value={policy.capacity.group_size.minimum}
                onChange={(e) =>
                  onChange((p) => {
                    if (!("state" in p.capacity.group_size))
                      p.capacity.group_size.minimum = Number(e.target.value);
                  })
                }
              />
            </F>
            <F label={copy.capacity.groupMaximum}>
              <input
                className={input}
                type="number"
                min={0}
                value={policy.capacity.group_size.maximum}
                onChange={(e) =>
                  onChange((p) => {
                    if (!("state" in p.capacity.group_size))
                      p.capacity.group_size.maximum = Number(e.target.value);
                  })
                }
              />
            </F>
          </>
        )}
        <F label={copy.capacity.roleCounting}>
          <select
            className={input}
            value={
              typeof policy.capacity.role_count_model === "string"
                ? policy.capacity.role_count_model
                : policy.capacity.role_count_model.state
            }
            onChange={(e) =>
              onChange((p) => {
                p.capacity.role_count_model =
                  e.target.value === "leader_separate" || e.target.value === "leader_in_assistants"
                    ? e.target.value
                    : e.target.value === "inherit"
                      ? { state: "inherit" }
                      : undecidedSetting();
              })
            }
          >
            <option value="leader_separate">
              {copy.capacity.roleCountingOptions.leader_separate}
            </option>
            <option value="leader_in_assistants">
              {copy.capacity.roleCountingOptions.leader_in_assistants}
            </option>
            <option value="inherit">{copy.capacity.roleCountingOptions.inherit}</option>
            <option value="unresolved">{copy.capacity.roleCountingOptions.unresolved}</option>
          </select>
        </F>
      </section>
      <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
        <h2 className="text-lg font-bold md:col-span-2">{copy.booking.title}</h2>
        {(
          [
            "individual_open",
            "individual_close",
            "group_open",
            "group_close",
            "cancellation_close",
          ] as const
        ).map((k) => (
          <F key={k} label={copy.booking.windows[k]}>
            <Win
              value={policy.booking[k]}
              set={(v) =>
                onChange((p) => {
                  p.booking[k] = v;
                })
              }
            />
          </F>
        ))}
        <F label={copy.booking.scenario}>
          <select
            className={input}
            value={policy.booking.scenario}
            onChange={(e) =>
              onChange((p) => {
                p.booking.scenario = e.target.value as PolicyDraft["booking"]["scenario"];
              })
            }
          >
            <option value="none">{copy.booking.scenarioOptions.none}</option>
            <option value="confirmed_group">{copy.booking.scenarioOptions.confirmed_group}</option>
            <option value="no_confirmed_group">
              {copy.booking.scenarioOptions.no_confirmed_group}
            </option>
          </select>
        </F>
        {policy.booking.scenario !== "none" &&
          (["with_group", "without_group"] as const).map((field) => {
            const mapping = policy.booking.scenario_templates;
            const selected =
              mapping && !("state" in mapping) && typeof mapping[field] === "string"
                ? (mapping[field] as string)
                : "";
            return (
              <F key={field} label={copy.booking.templateLabels[field]}>
                <select
                  className={input}
                  value={selected}
                  onChange={(e) =>
                    onChange((p) => {
                      const prior = p.booking.scenario_templates;
                      const next =
                        prior && !("state" in prior)
                          ? prior
                          : {
                              with_group: undecidedSetting("pick_with_group_template"),
                              without_group: undecidedSetting("pick_without_group_template"),
                            };
                      next[field] = e.target.value || undecidedSetting("pick_paired_template");
                      p.booking.scenario_templates = next;
                    })
                  }
                >
                  <option value="">{copy.booking.undecided}</option>
                  {templates
                    .filter(
                      (p) =>
                        p.shelter === policy.shelter &&
                        p.booking.scenario ===
                          (field === "with_group" ? "confirmed_group" : "no_confirmed_group"),
                    )
                    .map((p) => (
                      <option key={p.template_key} value={p.template_key}>
                        {p.name}
                      </option>
                    ))}
                </select>
                <span className="block text-xs text-[var(--color-text-muted)]">
                  {copy.booking.templateNote}
                </span>
              </F>
            );
          })}
        <F label={copy.booking.freeze}>
          <select
            className={input}
            value={
              typeof policy.booking.group_freeze === "string"
                ? policy.booking.group_freeze
                : policy.booking.group_freeze.state
            }
            onChange={(e) =>
              onChange((p) => {
                p.booking.group_freeze =
                  e.target.value === "at_group_close" || e.target.value === "at_session_start"
                    ? e.target.value
                    : e.target.value === "inherit"
                      ? { state: "inherit" }
                      : undecidedSetting();
              })
            }
          >
            <option value="at_group_close">{copy.booking.freezeOptions.at_group_close}</option>
            <option value="at_session_start">{copy.booking.freezeOptions.at_session_start}</option>
            <option value="inherit">{copy.booking.freezeOptions.inherit}</option>
            <option value="unresolved">{copy.booking.freezeOptions.unresolved}</option>
          </select>
        </F>
        <F label={copy.booking.lateChange}>
          <select
            className={input}
            value={
              typeof policy.booking.late_group_change === "string"
                ? policy.booking.late_group_change
                : policy.booking.late_group_change.state
            }
            onChange={(e) =>
              onChange((p) => {
                p.booking.late_group_change =
                  e.target.value === "revalidate" || e.target.value === "manual_review"
                    ? e.target.value
                    : e.target.value === "inherit"
                      ? { state: "inherit" }
                      : undecidedSetting();
              })
            }
          >
            <option value="revalidate">{copy.booking.lateChangeOptions.revalidate}</option>
            <option value="manual_review">{copy.booking.lateChangeOptions.manual_review}</option>
            <option value="inherit">{copy.booking.lateChangeOptions.inherit}</option>
            <option value="unresolved">{copy.booking.lateChangeOptions.unresolved}</option>
          </select>
        </F>
        <F label={copy.booking.waitlistLimit}>
          <Lim
            value={policy.booking.waitlist_limit}
            set={(v) =>
              onChange((p) => {
                p.booking.waitlist_limit = v;
              })
            }
          />
        </F>
        <div className="flex gap-4 text-sm">
          <label>
            <input
              type="checkbox"
              checked={policy.booking.auto_approve}
              onChange={(e) =>
                onChange((p) => {
                  p.booking.auto_approve = e.target.checked;
                })
              }
            />{" "}
            {copy.booking.autoApprove}
          </label>
          <label>
            <input
              type="checkbox"
              checked={policy.booking.allow_waitlist}
              onChange={(e) =>
                onChange((p) => {
                  p.booking.allow_waitlist = e.target.checked;
                })
              }
            />{" "}
            {copy.booking.allowWaitlist}
          </label>
        </div>
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">{copy.roles.title}</h2>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addRole}>
            {copy.roles.add}
          </button>
        </div>
        {policy.roles.map((r, i) => (
          <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-4">
            <F label={copy.roles.key}>
              <input
                className={input}
                value={r.key}
                onChange={(e) =>
                  onChange((p) => {
                    p.roles[i].key = e.target.value;
                  })
                }
              />
            </F>
            <F label={copy.roles.label}>
              <input
                className={input}
                value={r.label}
                onChange={(e) =>
                  onChange((p) => {
                    p.roles[i].label = e.target.value;
                  })
                }
              />
            </F>
            <F label={copy.roles.minimum}>
              <input
                className={input}
                type="number"
                min={0}
                value={r.minimum}
                onChange={(e) =>
                  onChange((p) => {
                    p.roles[i].minimum = Number(e.target.value);
                  })
                }
              />
            </F>
            <F label={copy.roles.reserved}>
              <input
                className={input}
                type="number"
                min={0}
                value={r.reserved}
                onChange={(e) =>
                  onChange((p) => {
                    p.roles[i].reserved = Number(e.target.value);
                  })
                }
              />
            </F>
            <F label={copy.roles.maximum}>
              <Lim
                value={r.maximum}
                set={(v) =>
                  onChange((p) => {
                    p.roles[i].maximum = v;
                  })
                }
              />
            </F>
            <F label={copy.roles.tiers}>
              <Tier
                value={r.allowed_tiers}
                set={(v) =>
                  onChange((p) => {
                    p.roles[i].allowed_tiers = v;
                  })
                }
              />
            </F>
            <F label={copy.roles.credentials}>
              <Cred
                value={r.credentials}
                set={(v) =>
                  onChange((p) => {
                    p.roles[i].credentials = v;
                  })
                }
              />
            </F>
            <button
              type="button"
              className="text-sm text-[var(--color-error)]"
              onClick={() =>
                onChange((p) => {
                  p.roles.splice(i, 1);
                })
              }
            >
              {copy.roles.remove}
            </button>
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">{copy.quotas.title}</h2>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addQuota}>
            {copy.quotas.add}
          </button>
        </div>
        {policy.tier_quotas.map((q, i) => (
          <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-3">
            <F label={copy.quotas.key}>
              <input
                className={input}
                value={q.key}
                onChange={(e) =>
                  onChange((p) => {
                    p.tier_quotas[i].key = e.target.value;
                  })
                }
              />
            </F>
            <F label={copy.quotas.tiers}>
              <Tier
                value={q.tiers}
                set={(v) =>
                  onChange((p) => {
                    p.tier_quotas[i].tiers = v;
                  })
                }
              />
            </F>
            <F label={copy.quotas.maximum}>
              <Lim
                value={q.maximum}
                set={(v) =>
                  onChange((p) => {
                    p.tier_quotas[i].maximum = v;
                  })
                }
              />
            </F>
            <F label={copy.quotas.weekdays}>
              {Array.isArray(q.weekdays) ? (
                <Days
                  value={q.weekdays}
                  set={(v) =>
                    onChange((p) => {
                      p.tier_quotas[i].weekdays = v;
                    })
                  }
                />
              ) : (
                <button
                  type="button"
                  className="rounded border px-2 py-1"
                  onClick={() =>
                    onChange((p) => {
                      p.tier_quotas[i].weekdays = [0, 1, 2, 3, 4, 5, 6];
                    })
                  }
                >
                  {copy.quotas.resolveWeekdays}
                </button>
              )}
            </F>
            <button
              type="button"
              className="text-sm text-[var(--color-error)]"
              onClick={() =>
                onChange((p) => {
                  p.tier_quotas.splice(i, 1);
                })
              }
            >
              {copy.quotas.remove}
            </button>
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">{copy.daily.title}</h2>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addDaily}>
            {copy.daily.add}
          </button>
        </div>
        {policy.daily_limits.map((q, i) => (
          <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-4">
            <F label={copy.daily.key}>
              <input
                className={input}
                value={q.key}
                onChange={(e) =>
                  onChange((p) => {
                    p.daily_limits[i].key = e.target.value;
                  })
                }
              />
            </F>
            <F label={copy.daily.tiers}>
              <Tier
                value={q.tiers}
                set={(v) =>
                  onChange((p) => {
                    p.daily_limits[i].tiers = v;
                  })
                }
              />
            </F>
            <F label={copy.daily.maximum}>
              <Lim
                value={q.maximum}
                set={(v) =>
                  onChange((p) => {
                    p.daily_limits[i].maximum = v;
                  })
                }
              />
            </F>
            <F label={copy.daily.scope}>
              <select
                className={input}
                value={q.scope}
                onChange={(e) =>
                  onChange((p) => {
                    p.daily_limits[i].scope = e.target.value as "shelter_day" | "all_shelters_day";
                  })
                }
              >
                <option value="shelter_day">{copy.daily.scopeOptions.shelter_day}</option>
                <option value="all_shelters_day">{copy.daily.scopeOptions.all_shelters_day}</option>
              </select>
            </F>
            <F label={copy.daily.countMode}>
              <select
                className={input}
                value={typeof q.count_mode === "string" ? q.count_mode : q.count_mode.state}
                onChange={(e) =>
                  onChange((p) => {
                    p.daily_limits[i].count_mode =
                      e.target.value === "distinct_people" || e.target.value === "attendances"
                        ? e.target.value
                        : e.target.value === "inherit"
                          ? { state: "inherit" }
                          : undecidedSetting();
                  })
                }
              >
                <option value="distinct_people">{copy.daily.countOptions.distinct_people}</option>
                <option value="attendances">{copy.daily.countOptions.attendances}</option>
                <option value="inherit">{copy.daily.countOptions.inherit}</option>
                <option value="unresolved">{copy.daily.countOptions.unresolved}</option>
              </select>
            </F>
            <F label={copy.daily.includeGroupVisitors}>
              <ConfigBool
                value={q.include_group_visitors}
                set={(v) =>
                  onChange((p) => {
                    p.daily_limits[i].include_group_visitors = v;
                  })
                }
              />
            </F>
            <button
              type="button"
              className="text-sm text-[var(--color-error)]"
              onClick={() =>
                onChange((p) => {
                  p.daily_limits.splice(i, 1);
                })
              }
            >
              {copy.daily.remove}
            </button>
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">{copy.release.title}</h2>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addRelease}>
            {copy.release.add}
          </button>
        </div>
        {policy.release_rules.map((r, i) =>
          "state" in r ? (
            <div key={i} className="rounded border p-3 text-sm">
              <b>{copy.release.unresolved}</b>
              {copy.release.reasonText(r.reason)}
              {copy.release.afterReason}
              <button
                type="button"
                className="ml-3 rounded border px-2 py-1"
                onClick={() =>
                  onChange((p) => {
                    p.release_rules.splice(i, 1);
                  })
                }
              >
                {copy.release.remove}
              </button>
            </div>
          ) : (
            <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-4">
              <F label={copy.release.key}>
                <input
                  className={input}
                  value={r.key}
                  onChange={(e) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x)) x.key = e.target.value;
                    })
                  }
                />
              </F>
              <F label={copy.release.semantics}>
                <select
                  className={input}
                  value={typeof r.semantics === "string" ? r.semantics : ""}
                  onChange={(e) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x))
                        x.semantics =
                          e.target.value === "once"
                            ? "once"
                            : e.target.value === "dynamic"
                              ? "dynamic"
                              : undecidedSetting("pick_release_semantics");
                    })
                  }
                >
                  <option value="">{copy.release.semanticsOptions.notSet}</option>
                  <option value="dynamic">{copy.release.semanticsOptions.dynamic}</option>
                  <option value="once">{copy.release.semanticsOptions.once}</option>
                </select>
              </F>
              <F label={copy.release.priority}>
                <input
                  className={input}
                  type="number"
                  min={0}
                  value={r.priority}
                  onChange={(e) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x)) x.priority = Number(e.target.value);
                    })
                  }
                />
              </F>
              <F label={copy.release.withinHours}>
                <input
                  className={input}
                  type="number"
                  min={0}
                  value={r.within_hours}
                  onChange={(e) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x)) x.within_hours = Number(e.target.value);
                    })
                  }
                />
              </F>
              <F label={copy.release.operator}>
                <select
                  className={input}
                  value={r.condition.operator}
                  onChange={(e) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x)) x.condition.operator = e.target.value as "lt" | "lte";
                    })
                  }
                >
                  <option value="lt">{copy.release.operatorOptions.lt}</option>
                  <option value="lte">{copy.release.operatorOptions.lte}</option>
                </select>
              </F>
              <F label={copy.release.threshold}>
                <input
                  className={input}
                  type="number"
                  min={0}
                  value={typeof r.condition.threshold === "number" ? r.condition.threshold : ""}
                  onChange={(e) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x)) x.condition.threshold = Number(e.target.value);
                    })
                  }
                />
              </F>
              <F label={copy.release.action}>
                <select
                  className={input}
                  value={r.action.type}
                  onChange={(e) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x))
                        x.action =
                          e.target.value === "release_reserved"
                            ? {
                                type: "release_reserved",
                                pool: p.roles[0]?.key ?? "experienced",
                                quantity: 1,
                              }
                            : {
                                type: "relax_quota",
                                quota:
                                  p.tier_quotas[0]?.key ?? p.daily_limits[0]?.key ?? "newcomer",
                                new_maximum: 1,
                                scope: "session",
                              };
                    })
                  }
                >
                  <option value="release_reserved">
                    {copy.release.actionOptions.release_reserved}
                  </option>
                  <option value="relax_quota">{copy.release.actionOptions.relax_quota}</option>
                </select>
              </F>
              {r.action.type === "release_reserved" ? (
                <>
                  <F label={copy.release.pool}>
                    <select
                      className={input}
                      value={r.action.pool}
                      onChange={(e) =>
                        onChange((p) => {
                          const x = p.release_rules[i];
                          if (!("state" in x) && x.action.type === "release_reserved")
                            x.action.pool = e.target.value;
                        })
                      }
                    >
                      {policy.roles.map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.label}
                        </option>
                      ))}
                    </select>
                  </F>
                  <F label={copy.release.quantity}>
                    <input
                      className={input}
                      type="number"
                      min={0}
                      value={r.action.quantity}
                      onChange={(e) =>
                        onChange((p) => {
                          const x = p.release_rules[i];
                          if (!("state" in x) && x.action.type === "release_reserved")
                            x.action.quantity = Number(e.target.value);
                        })
                      }
                    />
                  </F>
                </>
              ) : (
                <>
                  <F label={copy.release.quota}>
                    <select
                      className={input}
                      value={r.action.quota}
                      onChange={(e) =>
                        onChange((p) => {
                          const x = p.release_rules[i];
                          if (!("state" in x) && x.action.type === "relax_quota")
                            x.action.quota = e.target.value;
                        })
                      }
                    >
                      {[
                        ...policy.tier_quotas.map((x) => ({ kind: "tier" as const, key: x.key })),
                        ...policy.daily_limits.map((x) => ({ kind: "daily" as const, key: x.key })),
                      ].map((x) => (
                        <option key={x.key} value={x.key}>
                          {copy.release.quotaOption(x.kind, x.key)}
                        </option>
                      ))}
                    </select>
                  </F>
                  <F label={copy.release.quotaScope}>
                    <select
                      className={input}
                      value={r.action.scope}
                      onChange={(e) =>
                        onChange((p) => {
                          const x = p.release_rules[i];
                          if (!("state" in x) && x.action.type === "relax_quota") {
                            x.action.scope = e.target.value as
                              | "session"
                              | "shelter_day"
                              | "all_shelters_day";
                          }
                        })
                      }
                    >
                      <option value="session">{copy.release.quotaScopeOptions.session}</option>
                      <option value="shelter_day">
                        {copy.release.quotaScopeOptions.shelter_day}
                      </option>
                      <option value="all_shelters_day">
                        {copy.release.quotaScopeOptions.all_shelters_day}
                      </option>
                    </select>
                  </F>
                  {r.action.scope !== "session" && (
                    <F label={copy.release.anchor}>
                      <select
                        className={input}
                        value={
                          typeof r.action.daily_anchor === "string"
                            ? r.action.daily_anchor
                            : "unresolved"
                        }
                        onChange={(e) =>
                          onChange((p) => {
                            const x = p.release_rules[i];
                            if (!("state" in x) && x.action.type === "relax_quota") {
                              x.action.daily_anchor =
                                e.target.value === "first_session" ||
                                e.target.value === "last_session"
                                  ? e.target.value
                                  : undecidedSetting("pick_daily_anchor_pending");
                            }
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
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        {copy.release.anchorNote}
                      </span>
                    </F>
                  )}
                  <F label={copy.release.newMaximum}>
                    <input
                      className={input}
                      type="number"
                      min={0}
                      value={r.action.new_maximum}
                      onChange={(e) =>
                        onChange((p) => {
                          const x = p.release_rules[i];
                          if (!("state" in x) && x.action.type === "relax_quota")
                            x.action.new_maximum = Number(e.target.value);
                        })
                      }
                    />
                  </F>
                </>
              )}
              <F label={copy.release.receivingTiers}>
                <Tier
                  value={r.allowed_tiers}
                  set={(v) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x)) x.allowed_tiers = v;
                    })
                  }
                />
              </F>
              <F label={copy.release.credentials}>
                <Cred
                  value={r.credentials}
                  set={(v) =>
                    onChange((p) => {
                      const x = p.release_rules[i];
                      if (!("state" in x)) x.credentials = v;
                    })
                  }
                />
              </F>
              <button
                type="button"
                className="text-sm text-[var(--color-error)]"
                onClick={() =>
                  onChange((p) => {
                    p.release_rules.splice(i, 1);
                  })
                }
              >
                {copy.release.removeRule}
              </button>
            </div>
          ),
        )}
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-bold">{copy.source}</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{policy.source}</p>
      </section>
    </div>
  );
}
