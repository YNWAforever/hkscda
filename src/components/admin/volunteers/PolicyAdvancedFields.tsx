import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { SourceListing } from "../../../lib/volunteers/policy/sourceService";
import { initialPolicyCatalogue } from "../../../lib/volunteers/policy/catalogue";
import type { PolicyDraft } from "../../../lib/volunteers/policy/schemas";
const input =
  "min-h-10 w-full rounded-md border border-[var(--color-border)] bg-white px-2 py-1.5 text-sm";
const tiers = ["newcomer", "regular", "senior"] as const,
  days = ["日", "一", "二", "三", "四", "五", "六"];
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
  return (
    <div>
      {tiers.map((t) => (
        <label key={t} className="mr-3 text-xs">
          <input
            type="checkbox"
            checked={value.includes(t)}
            onChange={(e) => set(e.target.checked ? [...value, t] : value.filter((x) => x !== t))}
          />{" "}
          {{ newcomer: "新手", regular: "恆常", senior: "資深" }[t]}
        </label>
      ))}
    </div>
  );
}
function Days({ value, set }: { value: number[]; set: (v: number[]) => void }) {
  return (
    <div>
      {days.map((d, i) => (
        <label key={i} className="mr-2 text-xs">
          <input
            type="checkbox"
            checked={value.includes(i)}
            onChange={(e) => set(e.target.checked ? [...value, i] : value.filter((x) => x !== i))}
          />{" "}
          週{d}
        </label>
      ))}
    </div>
  );
}
function Lim({ value, set }: { value: Limit; set: (v: Limit) => void }) {
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
                  : { state: "unresolved", reason: "待管理員設定" },
          )
        }
      >
        <option value="value">指定數量</option>
        <option value="unlimited">不限</option>
        <option value="inherit">沿用</option>
        <option value="unresolved">未決定</option>
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
        <option value="all">全部資格 AND</option>
        <option value="any">任何資格 OR</option>
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
          新增資格名稱
        </a>
      </div>
    </div>
  );
}
function Win({ value, set }: { value: Window; set: (v: Window) => void }) {
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
                    : { state: "unresolved", reason: "待管理員設定" },
          );
        }}
      >
        <option value="hours_before">活動前小時</option>
        <option value="calendar_days_before">香港日曆日前</option>
        <option value="unrestricted">不限制</option>
        <option value="disabled">停用</option>
        <option value="inherit">沿用</option>
        <option value="unresolved">未決定</option>
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
                : { state: "unresolved", reason: "待管理員設定" },
        )
      }
    >
      <option value="true">是</option>
      <option value="false">否</option>
      <option value="inherit">沿用</option>
      <option value="unresolved">未決定</option>
    </select>
  );
}
export function PolicyAdvancedFields({
  policy,
  onChange,
}: {
  policy: PolicyDraft;
  onChange: (fn: (p: PolicyDraft) => void) => void;
}) {
  const addRole = () =>
    onChange((p) =>
      p.roles.push({
        key: "new_role",
        label: "新職務",
        minimum: 0,
        reserved: 0,
        maximum: { state: "unlimited" },
        allowed_tiers: ["regular"],
        credentials: { mode: "all", keys: [] },
      }),
    );
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
        <h2 className="text-lg font-bold md:col-span-3">完整名額設定</h2>
        <F label="義工名額">
          <Lim
            value={policy.capacity.volunteers}
            set={(v) =>
              onChange((p) => {
                p.capacity.volunteers = v;
              })
            }
          />
        </F>
        <F label="訪客名額">
          <Lim
            value={policy.capacity.visitors}
            set={(v) =>
              onChange((p) => {
                p.capacity.visitors = v;
              })
            }
          />
        </F>
        <F label="共用總名額">
          <Lim
            value={policy.capacity.shared_total}
            set={(v) =>
              onChange((p) => {
                p.capacity.shared_total = v;
              })
            }
          />
        </F>
        <F label="團體計入共用總數">
          <ConfigBool
            value={policy.capacity.group_in_shared_total}
            set={(v) =>
              onChange((p) => {
                p.capacity.group_in_shared_total = v;
              })
            }
          />
        </F>
        <F label="團體人數模式">
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
                      : { state: "unresolved", reason: "待管理員設定" };
              })
            }
          >
            <option value="value">指定範圍</option>
            <option value="inherit">沿用</option>
            <option value="unresolved">未決定</option>
          </select>
        </F>
        {"state" in policy.capacity.group_size ? null : (
          <>
            <F label="團體最少人數">
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
            <F label="團體最多人數">
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
        <F label="領隊計算方式">
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
                      : { state: "unresolved", reason: "待管理員設定" };
              })
            }
          >
            <option value="leader_separate">領隊另計</option>
            <option value="leader_in_assistants">領隊包括在助手</option>
            <option value="inherit">沿用</option>
            <option value="unresolved">未決定</option>
          </select>
        </F>
      </section>
      <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
        <h2 className="text-lg font-bold md:col-span-2">報名及取消窗口</h2>
        {(
          [
            "individual_open",
            "individual_close",
            "group_open",
            "group_close",
            "cancellation_close",
          ] as const
        ).map((k) => (
          <F
            key={k}
            label={
              {
                individual_open: "個人開放",
                individual_close: "個人截止",
                group_open: "團體開放",
                group_close: "團體截止",
                cancellation_close: "取消截止",
              }[k]
            }
          >
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
        <F label="團體情景">
          <select
            className={input}
            value={policy.booking.scenario}
            onChange={(e) =>
              onChange((p) => {
                p.booking.scenario = e.target.value as PolicyDraft["booking"]["scenario"];
              })
            }
          >
            <option value="none">不適用</option>
            <option value="confirmed_group">有確認團體</option>
            <option value="no_confirmed_group">沒有確認團體</option>
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
              <F
                key={field}
                label={
                  field === "with_group" ? "有團體時採用的已發布模板" : "無團體時採用的已發布模板"
                }
              >
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
                              with_group: {
                                state: "unresolved" as const,
                                reason: "請選擇有團體模板",
                              },
                              without_group: {
                                state: "unresolved" as const,
                                reason: "請選擇無團體模板",
                              },
                            };
                      next[field] = e.target.value || {
                        state: "unresolved",
                        reason: "請選擇配對模板",
                      };
                      p.booking.scenario_templates = next;
                    })
                  }
                >
                  <option value="">未決定</option>
                  {initialPolicyCatalogue
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
                  確認團體時按活動日期讀取此模板的已發布版本；未完成或未發布的模板不能套用。
                </span>
              </F>
            );
          })}
        <F label="團體名額凍結">
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
                      : { state: "unresolved", reason: "待管理員設定" };
              })
            }
          >
            <option value="at_group_close">團體截止時</option>
            <option value="at_session_start">活動開始時</option>
            <option value="inherit">沿用</option>
            <option value="unresolved">未決定</option>
          </select>
        </F>
        <F label="遲來團體變更">
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
                      : { state: "unresolved", reason: "待管理員設定" };
              })
            }
          >
            <option value="revalidate">重新驗證</option>
            <option value="manual_review">人手審核</option>
            <option value="inherit">沿用</option>
            <option value="unresolved">未決定</option>
          </select>
        </F>
        <F label="候補上限">
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
            自動批准
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
            容許候補
          </label>
        </div>
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">職務名額</h2>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addRole}>
            新增職務
          </button>
        </div>
        {policy.roles.map((r, i) => (
          <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-4">
            <F label="識別碼">
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
            <F label="顯示名稱">
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
            <F label="最低人數">
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
            <F label="保留名額">
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
            <F label="最高人數">
              <Lim
                value={r.maximum}
                set={(v) =>
                  onChange((p) => {
                    p.roles[i].maximum = v;
                  })
                }
              />
            </F>
            <F label="可用級別">
              <Tier
                value={r.allowed_tiers}
                set={(v) =>
                  onChange((p) => {
                    p.roles[i].allowed_tiers = v;
                  })
                }
              />
            </F>
            <F label="職務資格">
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
              刪除職務
            </button>
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">級別配額</h2>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addQuota}>
            新增配額
          </button>
        </div>
        {policy.tier_quotas.map((q, i) => (
          <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-3">
            <F label="識別碼">
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
            <F label="級別">
              <Tier
                value={q.tiers}
                set={(v) =>
                  onChange((p) => {
                    p.tier_quotas[i].tiers = v;
                  })
                }
              />
            </F>
            <F label="上限">
              <Lim
                value={q.maximum}
                set={(v) =>
                  onChange((p) => {
                    p.tier_quotas[i].maximum = v;
                  })
                }
              />
            </F>
            <F label="適用星期">
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
                  解析星期設定
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
              刪除配額
            </button>
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">每日限制</h2>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addDaily}>
            新增限制
          </button>
        </div>
        {policy.daily_limits.map((q, i) => (
          <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-4">
            <F label="識別碼">
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
            <F label="級別">
              <Tier
                value={q.tiers}
                set={(v) =>
                  onChange((p) => {
                    p.daily_limits[i].tiers = v;
                  })
                }
              />
            </F>
            <F label="上限">
              <Lim
                value={q.maximum}
                set={(v) =>
                  onChange((p) => {
                    p.daily_limits[i].maximum = v;
                  })
                }
              />
            </F>
            <F label="範圍">
              <select
                className={input}
                value={q.scope}
                onChange={(e) =>
                  onChange((p) => {
                    p.daily_limits[i].scope = e.target.value as "shelter_day" | "all_shelters_day";
                  })
                }
              >
                <option value="shelter_day">同一舍全日</option>
                <option value="all_shelters_day">所有場地全日</option>
              </select>
            </F>
            <F label="計算方式">
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
                          : { state: "unresolved", reason: "待管理員設定" };
                  })
                }
              >
                <option value="distinct_people">不同人士</option>
                <option value="attendances">出席人次</option>
                <option value="inherit">沿用</option>
                <option value="unresolved">未決定</option>
              </select>
            </F>
            <F label="包括團體訪客">
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
              刪除限制
            </button>
          </div>
        ))}
      </section>
      <section className="space-y-3 rounded-lg border bg-white p-4">
        <div className="flex justify-between">
          <h2 className="text-lg font-bold">遲段補位規則</h2>
          <button type="button" className="rounded border px-3 py-1 text-sm" onClick={addRelease}>
            新增規則
          </button>
        </div>
        {policy.release_rules.map((r, i) =>
          "state" in r ? (
            <div key={i} className="rounded border p-3 text-sm">
              <b>未解析：</b>
              {r.reason}
              <button
                type="button"
                className="ml-3 rounded border px-2 py-1"
                onClick={() =>
                  onChange((p) => {
                    p.release_rules.splice(i, 1);
                  })
                }
              >
                移除
              </button>
            </div>
          ) : (
            <div key={i} className="grid gap-2 rounded border p-3 md:grid-cols-4">
              <F label="識別碼">
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
              <F label="釋放方式">
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
                              : { state: "unresolved", reason: "請選擇釋放方式" };
                    })
                  }
                >
                  <option value="">待設定</option>
                  <option value="dynamic">動態：條件改變即重新計算</option>
                  <option value="once">一次：觸發後不收回釋放</option>
                </select>
              </F>
              <F label="優先次序">
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
              <F label="活動前小時">
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
              <F label="門檻比較">
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
                  <option value="lt">少於</option>
                  <option value="lte">不多於</option>
                </select>
              </F>
              <F label="門檻">
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
              <F label="動作">
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
                  <option value="release_reserved">釋放職務保留位</option>
                  <option value="relax_quota">放寬配額</option>
                </select>
              </F>
              {r.action.type === "release_reserved" ? (
                <>
                  <F label="保留池">
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
                  <F label="釋放數量">
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
                  <F label="配額">
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
                      {[...policy.tier_quotas, ...policy.daily_limits].map((x) => (
                        <option key={x.key} value={x.key}>
                          {x.key}
                        </option>
                      ))}
                    </select>
                  </F>
                  <F label="配額作用範圍">
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
                      <option value="session">單場</option>
                      <option value="shelter_day">此場地全日</option>
                      <option value="all_shelters_day">跨場地全日</option>
                    </select>
                  </F>
                  {r.action.scope !== "session" && (
                    <F label="每日補位時間基準（須明選）">
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
                                  : { state: "unresolved", reason: "待選全日首場或末場時間基準" };
                            }
                          })
                        }
                      >
                        <option value="unresolved">未決定</option>
                        <option value="first_session">同一範圍當日首場開始時間</option>
                        <option value="last_session">同一範圍當日末場開始時間</option>
                      </select>
                      <span className="block text-xs text-[var(--color-text-muted)]">
                        熟手門檻按同一範圍全日已確認人數計算；所有場次共用當日配額。
                      </span>
                    </F>
                  )}
                  <F label="新上限">
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
              <F label="可接收級別">
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
              <F label="資格">
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
                刪除規則
              </button>
            </div>
          ),
        )}
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-bold">政策來源</h2>
        <p className="mt-1 text-sm text-[var(--color-text-muted)]">{policy.source}</p>
      </section>
    </div>
  );
}
