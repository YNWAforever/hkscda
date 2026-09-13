import { useUnsavedVolunteerDraft } from "./useUnsavedVolunteerDraft";
import { PolicyChangeSummary } from "./PolicyChangeSummary";
import { WorkflowSections } from "./WorkflowSections";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { getPolicyReadiness, type PolicyDraft } from "../../../lib/volunteers/policy/schemas";
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
type Preview = {
  preview_id: string;
  occupied: number;
  before: Daily;
  after: Daily;
  activity_ids: string[];
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
const tierName = { newcomer: "新手", regular: "恆常", senior: "資深" };
const days = ["日", "一", "二", "三", "四", "五", "六"];
const limitText = (v: Daily["maximum"]) =>
  v.state === "value" ? String(v.value) : v.state === "unlimited" ? "無上限" : "未決定";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
export function VolunteerDailySettings() {
  const qc = useQueryClient();
  const listing = useQuery({
    queryKey: ["volunteer-daily-settings"],
    queryFn: () => api<Listing>({ action: "list" }),
  });
  const [selection, setSelection] = useState("");
  const [draft, setDraft] = useState<PolicyDraft>();
  const [dirty, setDirty] = useState(false);
  const [preview, setPreview] = useState<Preview>();
  const [publishKey, setPublishKey] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");
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
    setMessage("");
  };
  const editQuota = (change: (q: Daily) => void) =>
    edit((p) => {
      const q = p.daily_limits.find((q) => q.key === binding?.body.key);
      if (q) change(q);
    });
  const readiness = draft ? getPolicyReadiness(draft) : undefined;
  const pre = useMutation({
    mutationFn: () =>
      api<Preview>({
        action: "preview",
        scope_key: binding!.scope_key,
        service_date: binding!.service_date,
        expected_revision: binding!.revision,
        body: draft,
      }),
    onSuccess: (p) => {
      setPreview(p);
      setPublishKey(crypto.randomUUID());
      setMessage("全日影響預覽已更新；請核對後發布。");
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
      setMessage("全日配額已發布；同一天所有場次立即使用同一修訂。");
      void qc.invalidateQueries({ queryKey: ["volunteer-daily-settings"] });
      void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
      void qc.invalidateQueries({ queryKey: ["volunteer-calendar"] });
    },
    onError: () => setPreview(undefined),
  });
  const error = listing.error ?? pre.error ?? publish.error;
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">全日義工配額</h1>
        <p className="text-sm text-[var(--color-text-muted)]">
          同一範圍及日期的場次共用同一配額。先預覽全日名單影響，再發布；不會自動取消已有報名。
        </p>
        <a className="underline" href="/admin/volunteers/settings">
          返回義工政策設定
        </a>
      </header>
      <WorkflowSections
        sections={[
          { id: "daily-quota", label: "全日配額" },
          { id: "daily-release", label: "晚期補位" },
          { id: "daily-publish", label: "發布核對" },
        ]}
      />
      {listing.isLoading && <p>讀取全日設定中…</p>}
      {error && (
        <p role="alert">{error instanceof Error ? error.message : "未能處理設定，請重試。"}</p>
      )}
      {message && <p role="status">{message}</p>}
      <span id="daily-quota" />
      <Field label="選擇日期及配額">
        <select
          className={input}
          value={selection}
          disabled={dirty || publish.isPending}
          onChange={(e) => setSelection(e.target.value)}
        >
          <option value="">請選擇</option>
          {listing.data?.bindings.map((b) => (
            <option
              key={`${b.scope_key}|${b.service_date}`}
              value={`${b.scope_key}|${b.service_date}`}
            >
              {b.service_date} ·{" "}
              {b.scope_key.startsWith("all:")
                ? "跨場地"
                : b.scope_key.startsWith("dog:")
                  ? "狗舍"
                  : "貓舍"}{" "}
              · {b.body.tiers.map((t) => tierName[t]).join("／")}每日配額
            </option>
          ))}
        </select>
      </Field>
      {listing.data?.bindings.length === 0 && (
        <p>尚未生成設有每日配額的場次。請先在義工政策設定發布政策及建立場次。</p>
      )}
      {binding && quota && draft && (
        <>
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h2 className="text-lg font-bold">
              {binding.service_date} · 修訂 {binding.revision}
              {dirty ? "（尚未發布）" : ""}
            </h2>
            <p>
              目前每日上限：{limitText(binding.body.maximum)}。共有 {binding.activities.length}{" "}
              場受同一配額影響。
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="每日名額模式">
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
                  <option value="value">指定數量</option>
                  <option value="unlimited">無上限</option>
                </select>
              </Field>
              <Field label="每日名額">
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
              <Field label="計數方式">
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
                    未決定
                  </option>
                  <option value="distinct_people">同一人全日計一次</option>
                  <option value="attendances">每個確認時段計一次</option>
                </select>
              </Field>
            </div>
            <fieldset>
              <legend className="text-sm font-semibold">受配額限制的級別</legend>
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
                  {tierName[t]}
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
              計入團體訪客人次（未有訪客身份時不可按不同人計數）
            </label>
          </section>
          <section className="space-y-4 rounded-lg border bg-white p-4">
            <h2 id="daily-release" className="text-lg font-bold">
              每日晚期補位
            </h2>
            <p className="text-sm">
              只放寬每日分項；各場總容量、必要資格及報名截止仍然適用。門檻按同一範圍全日已確認人次計算。
            </p>
            {draft.release_rules.map((r, i) =>
              !("state" in r) &&
              r.action.type === "relax_quota" &&
              r.action.scope === quota.scope &&
              r.action.quota === quota.key ? (
                <div key={r.key} className="space-y-3 rounded-md border p-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="釋放方式">
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
                                    : { state: "unresolved", reason: "請選擇釋放方式" };
                          })
                        }
                      >
                        <option value="">待設定</option>
                        <option value="dynamic">動態重新計算</option>
                        <option value="once">一次釋放後不收回</option>
                      </select>
                    </Field>
                    <Field label="開始前小時">
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
                    <Field label="全日時段基準">
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
                                  : { state: "unresolved", reason: "請選擇全日時間基準" };
                          })
                        }
                      >
                        <option value="unresolved">未決定</option>
                        <option value="first_session">當日首場</option>
                        <option value="last_session">當日末場</option>
                      </select>
                    </Field>
                    <Field label="門檻比較">
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
                        <option value="lt">少於</option>
                        <option value="lte">不多於</option>
                      </select>
                    </Field>
                    <Field label="已確認人次門檻">
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
                    <legend>門檻計算的級別</legend>
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
                        {tierName[t]}
                      </label>
                    ))}
                  </fieldset>
                  <Field label="補位後每日上限">
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
                    <legend>可補位級別</legend>
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
                        {tierName[t]}
                      </label>
                    ))}
                  </fieldset>
                  <Field label="補位資格組合">
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
                      <option value="all">全部所選資格</option>
                      <option value="any">任何所選資格</option>
                    </select>
                  </Field>
                  <fieldset>
                    <legend>必要補位資格</legend>
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
                  <Field label="星期限制">
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
                      <option value="preserve">保留原有星期限制</option>
                      <option value="override">按以下補位星期</option>
                    </select>
                  </Field>
                  {Array.isArray(r.weekdays) && (
                    <fieldset>
                      <legend>補位星期</legend>
                      {days.map((d, n) => (
                        <label key={d} className="mr-3 inline-flex min-h-11 items-center gap-2">
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
                          週{d}
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
                    移除此補位規則
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
                      threshold: { state: "unresolved", reason: "請填寫熟手不足門檻" },
                    },
                    action: {
                      type: "relax_quota",
                      quota: quota.key,
                      scope: quota.scope,
                      new_maximum:
                        p.capacity.volunteers.state === "value" ? p.capacity.volunteers.value : 1,
                      daily_anchor: { state: "unresolved", reason: "請選擇首場或末場" },
                    },
                    allowed_tiers: [...quota.tiers],
                    credentials: { mode: "all", keys: [] },
                    weekdays: "preserve",
                  });
                })
              }
            >
              新增每日補位規則
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
              預覽全日影響
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
              放棄未發布變更
            </button>
          </div>
          {preview && (
            <section className="space-y-4 rounded-lg border bg-white p-4">
              <h2 id="daily-publish" className="text-lg font-bold">
                發布前核對
              </h2>
              <PolicyChangeSummary before={preview.before} after={preview.after} />
              <p>
                每日名額由 {limitText(preview.before.maximum)} 改為{" "}
                {limitText(preview.after.maximum)}；目前已計 {preview.occupied}，適用全日{" "}
                {preview.activity_ids.length} 場。以上補位設定亦會取代當日版本。
              </p>
              <ul>
                {binding.activities
                  .filter((a) => preview.activity_ids.includes(a.id))
                  .map((a) => (
                    <li key={a.id}>
                      {a.title} ·{" "}
                      {new Date(a.starts_at).toLocaleTimeString("zh-HK", {
                        timeZone: binding.timezone,
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </li>
                  ))}
              </ul>
              <Field label="發布原因">
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
                確認發布全日配額
              </button>
            </section>
          )}
        </>
      )}
    </div>
  );
}
