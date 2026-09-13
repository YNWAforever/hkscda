import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchAdminJson } from "../../../lib/admin/http";
import {
  initialMonthlyPolicy,
  initialPolicyCatalogue,
} from "../../../lib/volunteers/policy/catalogue";
import { PolicyAdvancedFields } from "./PolicyAdvancedFields";
import { PolicySourceFields } from "./PolicySourceFields";
import type { SourceListing } from "../../../lib/volunteers/policy/sourceService";
import {
  getPolicyReadiness,
  policyDraftSchema,
  type PolicyDraft,
} from "../../../lib/volunteers/policy/schemas";
type D = { template_key: string; body: PolicyDraft; revision: number };
type V = { id: string; template_key: string; effective_from: string; reason: string };
type A = {
  id: string;
  title: string;
  starts_at: string;
  capacity: number;
  template_key: string | null;
  approved_participants: number;
  waitlisted_participants: number;
};
type L = { drafts: D[]; versions: V[]; activities: A[] };
type P = {
  preview_id: string;
  candidate: PolicyDraft;
  previous: PolicyDraft | null;
  issues: { path?: string; message?: string }[];
  manifest: (A & { conflicts: string[] })[];
};
const api = <T,>(x: object) =>
    fetchAdminJson<T>("/api/admin/volunteers/settings", {
      method: "POST",
      body: JSON.stringify(x),
    }),
  ic = "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm",
  bc = "min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50",
  hk = (d: string) => d + "T00:00:00+08:00";
function F({ n, c }: { n: string; c: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <b className="block text-sm">{n}</b>
      {c}
    </label>
  );
}
export function VolunteerPolicySettings() {
  const registry = useQuery({
    queryKey: ["volunteer-policy-sources"],
    queryFn: () =>
      fetchAdminJson<SourceListing>("/api/admin/volunteers/sources/", {
        method: "POST",
        body: JSON.stringify({ action: "list" }),
      }),
  });
  const qc = useQueryClient(),
    q = useQuery({
      queryKey: ["volunteer-policy-settings"],
      queryFn: () => api<L>({ action: "list" }),
    });
  const [key, setKey] = useState(initialPolicyCatalogue[0].template_key),
    [draft, setDraft] = useState<PolicyDraft>(),
    [rev, setRev] = useState(0),
    [dirty, setDirty] = useState(false),
    [preview, setPreview] = useState<P>(),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [reason, setReason] = useState(""),
    [date, setDate] = useState(""),
    [ids, setIds] = useState<string[]>([]),
    [note, setNote] = useState("");
  const row = q.data?.drafts.find((x) => x.template_key === key),
    base = initialPolicyCatalogue.find((x) => x.template_key === key);
  useEffect(() => {
    const x = row?.body ?? base;
    if (x) {
      setDraft(structuredClone(x));
      setRev(row?.revision ?? 0);
      setDirty(false);
      setPreview(undefined);
      setIds([]);
    }
  }, [row, base, key]);
  useEffect(() => {
    if (!dirty) return;
    const f = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    addEventListener("beforeunload", f);
    return () => removeEventListener("beforeunload", f);
  }, [dirty]);
  const ready = useMemo(() => (draft ? getPolicyReadiness(draft) : null), [draft]);
  const edit = (f: (x: PolicyDraft) => void) => {
    if (!draft) return;
    const x = structuredClone(draft);
    f(x);
    setDraft(x);
    setDirty(true);
    setPreview(undefined);
  };
  const save = useMutation({
      mutationFn: () => {
        const p = policyDraftSchema.parse(draft);
        return api<{ draft: D }>({
          action: "save",
          template_key: key,
          expected_revision: rev,
          body: p,
        });
      },
      onSuccess: (r) => {
        setRev(r.draft.revision);
        setDraft(r.draft.body);
        setDirty(false);
        setNote("草稿已儲存。");
        void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
      },
    }),
    pre = useMutation({
      mutationFn: () => {
        if (dirty || !rev || !from) throw Error("請先儲存草稿並選擇生效日期。");
        return api<P>({
          action: "preview",
          template_key: key,
          expected_revision: rev,
          effective_from: hk(from),
          effective_until: until ? hk(until) : null,
          activity_ids: ids,
        });
      },
      onSuccess: (x) => setPreview(x),
    }),
    pub = useMutation({
      mutationFn: () => {
        if (!preview || !reason.trim()) throw Error("請先預覽並填寫發布原因。");
        return api<{ activity_ids: string[] }>({
          action: "publish",
          preview_id: preview.preview_id,
          idempotency_key: crypto.randomUUID(),
          reason,
        });
      },
      onSuccess: (x) => {
        setPreview(undefined);
        setNote("已發布，更新 " + x.activity_ids.length + " 個活動。");
        void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
      },
    }),
    gen = useMutation({
      mutationFn: () =>
        api({ action: "generate", template_key: key, date, idempotency_key: crypto.randomUUID() }),
      onSuccess: () => setNote("活動建立指令已完成。"),
    }),
    cp = useMutation({
      mutationFn: (id: string) => api({ action: "copy", version_id: id, expected_revision: rev }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] }),
    });
  if (q.isError)
    return (
      <p role="alert" className="p-6 text-[var(--color-error)]">
        未能載入義工政策。
      </p>
    );
  if (q.isLoading || !draft || !q.data) return <p className="p-6">正在載入義工政策…</p>;
  const activities = q.data.activities.filter(
      (x) => x.template_key === key || x.template_key === null,
    ),
    versions = q.data.versions.filter((x) => x.template_key === key),
    err = save.error ?? pre.error ?? pub.error ?? gen.error ?? cp.error;
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header>
        <h1 className="text-2xl font-bold">義工政策設定</h1>
        <a className="inline-block min-h-11 py-2 underline" href="/admin/volunteers/sources">
          共用來源、場地及資格
        </a>
        <button
          className={bc}
          onClick={() => {
            const next = structuredClone(draft);
            next.template_key = `template-${crypto.randomUUID()}`;
            next.name = `${draft.name}（副本）`;
            setKey(next.template_key);
            setDraft(next);
            setRev(0);
            setDirty(true);
            setPreview(undefined);
            setIds([]);
          }}
        >
          新增模板（複製目前設定）
        </button>
        <a className="inline-block min-h-11 py-2 underline" href="/admin/volunteers/simulation">
          政策模擬
        </a>
        <a className="inline-block min-h-11 py-2 underline" href="/admin/volunteers/daily-settings">
          管理全日配額及補位
        </a>
        <p className="text-sm text-[var(--color-text-muted)]">
          先儲存草稿，再預覽受影響活動。修訂 {rev}
          {dirty ? "（尚未儲存）" : ""}
        </p>
      </header>
      <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-3">
        <F
          n="政策模板"
          c={
            <select
              aria-label="政策模板"
              className={ic}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            >
              {[
                ...new Map(
                  [...initialPolicyCatalogue, ...q.data.drafts.map((x) => x.body), draft].map(
                    (x) => [x.template_key, x],
                  ),
                ).values(),
              ].map((x) => (
                <option key={x.template_key} value={x.template_key}>
                  {x.name}
                </option>
              ))}
            </select>
          }
        />
        <F
          n="名稱"
          c={
            <input
              className={ic}
              value={draft.name}
              onChange={(e) =>
                edit((x) => {
                  x.name = e.target.value;
                })
              }
            />
          }
        />
        <F
          n="場地"
          c={
            <select
              className={ic}
              aria-label="場地"
              value={draft.shelter}
              onChange={(e) =>
                edit((x) => {
                  x.shelter = e.target.value;
                  const site = registry.data?.shelters.find((s) => s.key === e.target.value);
                  if (site) {
                    x.timezone = site.timezone;
                    x.schedule.location = site.location;
                  }
                })
              }
            >
              {(
                registry.data?.shelters ?? [
                  { key: "cat", label: "貓舍" },
                  { key: "dog", label: "狗舍" },
                  { key: "adoption", label: "領養日" },
                ]
              ).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          }
        />
        <F
          n="開始時間"
          c={
            <input
              type="time"
              className={ic}
              value={typeof draft.schedule.start_time === "string" ? draft.schedule.start_time : ""}
              onChange={(e) =>
                edit((x) => {
                  x.schedule.start_time = e.target.value;
                })
              }
            />
          }
        />
        <F
          n="結束時間"
          c={
            <input
              type="time"
              className={ic}
              value={typeof draft.schedule.end_time === "string" ? draft.schedule.end_time : ""}
              onChange={(e) =>
                edit((x) => {
                  x.schedule.end_time = e.target.value;
                })
              }
            />
          }
        />
        <F
          n="地點"
          c={
            <input
              className={ic}
              value={typeof draft.schedule.location === "string" ? draft.schedule.location : ""}
              onChange={(e) =>
                edit((x) => {
                  x.schedule.location = e.target.value;
                })
              }
            />
          }
        />
        <F
          n="義工名額"
          c={
            <input
              type="number"
              min={1}
              className={ic}
              value={
                draft.capacity.volunteers.state === "value" ? draft.capacity.volunteers.value : ""
              }
              onChange={(e) =>
                edit((x) => {
                  x.capacity.volunteers = { state: "value", value: Number(e.target.value) };
                })
              }
            />
          }
        />
        <F
          n="最低年齡"
          c={
            <input
              type="number"
              min={0}
              className={ic}
              value={typeof draft.eligibility.min_age === "number" ? draft.eligibility.min_age : ""}
              onChange={(e) =>
                edit((x) => {
                  x.eligibility.min_age = Number(e.target.value);
                })
              }
            />
          }
        />
        <F
          n="備註標題"
          c={
            <input
              className={ic}
              value={draft.remarks.label}
              onChange={(e) =>
                edit((x) => {
                  x.remarks.label = e.target.value;
                })
              }
            />
          }
        />
        <F
          n="備註提示"
          c={
            <textarea
              className={ic}
              value={draft.remarks.hint}
              onChange={(e) =>
                edit((x) => {
                  x.remarks.hint = e.target.value;
                })
              }
            />
          }
        />
        <F
          n="所需資格（每行一項）"
          c={
            <textarea
              className={ic}
              value={draft.eligibility.credentials.keys.join("\n")}
              onChange={(e) =>
                edit((x) => {
                  x.eligibility.credentials.keys = e.target.value
                    .split(/\r?\n/)
                    .map((v) => v.trim())
                    .filter(Boolean);
                })
              }
            />
          }
        />
        <fieldset>
          <legend className="text-sm font-bold">級別</legend>
          {(["newcomer", "regular", "senior"] as const).map((t) => (
            <label key={t} className="mr-3 text-sm">
              <input
                type="checkbox"
                checked={draft.eligibility.allowed_tiers.includes(t)}
                onChange={(e) =>
                  edit((x) => {
                    x.eligibility.allowed_tiers = e.target.checked
                      ? [...x.eligibility.allowed_tiers, t]
                      : x.eligibility.allowed_tiers.filter((v) => v !== t);
                  })
                }
              />{" "}
              {{ newcomer: "新手", regular: "恆常", senior: "資深" }[t]}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-[var(--color-text-muted)] md:col-span-3">
          進階規則：職務 {draft.roles.length}、級別配額 {draft.tier_quotas.length}、每日限制{" "}
          {draft.daily_limits.length}、補位規則 {draft.release_rules.length}
          。這些規則會保留；未解析項目如下。
        </p>
      </section>
      <PolicyAdvancedFields policy={draft} onChange={edit} />
      <PolicySourceFields policy={draft} onChange={edit} />
      <section className="space-y-2 rounded-lg border bg-white p-4">
        <h2 className="text-lg font-bold">每月級別評核（唯讀摘要）</h2>
        <a
          className="text-sm font-bold text-[var(--color-primary)] underline"
          href="/admin/volunteers/assessments"
        >
          前往每月評核設定及執行
        </a>
        <p className="text-sm text-[var(--color-text-muted)]">
          此頁的活動政策 API
          暫未儲存每月評核設定；以下只顯示目前政策目錄內容，避免把表格誤當成已發布設定。
        </p>
        <dl className="grid gap-2 text-sm md:grid-cols-2">
          <div>
            <dt className="font-bold">晉升恆常義工</dt>
            <dd>累積 {initialMonthlyPolicy.regular_attendance_threshold} 次核實出席</dd>
          </div>
          <div>
            <dt className="font-bold">資深年資</dt>
            <dd>{initialMonthlyPolicy.senior_years} 年</dd>
          </div>
          <div>
            <dt className="font-bold">每月最低出席</dt>
            <dd>
              恆常 {initialMonthlyPolicy.regular_monthly_minimum} 次；資深{" "}
              {initialMonthlyPolicy.senior_monthly_minimum} 次
            </dd>
          </div>
          <div>
            <dt className="font-bold">自動降級</dt>
            <dd>{initialMonthlyPolicy.senior_auto_demotion ? "啟用" : "停用"}</dd>
          </div>
        </dl>
        <div className="rounded-md bg-[var(--color-surface-offset)] p-3 text-sm">
          <b>仍待管理員決定</b>
          <ul className="mt-1 list-disc pl-5">
            {[
              ["資深恆常觀察期", initialMonthlyPolicy.senior_regular_observation_months],
              ["出席計算單位", initialMonthlyPolicy.attendance_unit],
              ["貓狗場地計算範圍", initialMonthlyPolicy.shelter_scope],
              ["晉升評核時點", initialMonthlyPolicy.promotion_trigger],
              ["每月執行時間", initialMonthlyPolicy.assessment_time],
            ].map(([label, value]) => (
              <li key={label as string}>
                {label as string}：
                {typeof value === "object" && value && "reason" in value
                  ? String(value.reason)
                  : "已設定"}
              </li>
            ))}
          </ul>
        </div>
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-bold">發布準備狀態</h2>
        {ready?.ready ? (
          <p className="text-sm text-[var(--color-success)]">沒有未解析設定。</p>
        ) : (
          <ul className="list-disc pl-5 text-sm text-[var(--color-warning)]">
            {ready?.issues.map((x) => (
              <li key={x.path}>
                <b>{x.path}</b>：{x.message}
              </li>
            ))}
          </ul>
        )}
      </section>
      <button
        className={bc + " bg-[var(--color-primary)] text-white"}
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
      >
        儲存草稿
      </button>
      <section className="space-y-4 rounded-lg border bg-white p-4">
        <h2 className="text-lg font-bold">預覽及發布</h2>
        <div className="grid gap-3 md:grid-cols-3">
          <F
            n="生效日期"
            c={
              <input
                type="date"
                className={ic}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPreview(undefined);
                }}
              />
            }
          />
          <F
            n="結束日期"
            c={
              <input
                type="date"
                className={ic}
                value={until}
                onChange={(e) => {
                  setUntil(e.target.value);
                  setPreview(undefined);
                }}
              />
            }
          />
          <F
            n="發布原因"
            c={<input className={ic} value={reason} onChange={(e) => setReason(e.target.value)} />}
          />
        </div>
        <fieldset>
          <legend className="text-sm font-bold">受影響活動</legend>
          {activities.map((a) => (
            <label key={a.id} className="block rounded border p-2 text-sm">
              <input
                type="checkbox"
                checked={ids.includes(a.id)}
                onChange={(e) => {
                  setIds((v) => (e.target.checked ? [...v, a.id] : v.filter((id) => id !== a.id)));
                  setPreview(undefined);
                }}
              />{" "}
              {a.title} · 名額 {a.capacity} · 已批 {a.approved_participants} · 候補{" "}
              {a.waitlisted_participants}
            </label>
          ))}
        </fieldset>
        <div className="flex gap-2">
          <button className={bc + " border"} disabled={dirty || !rev} onClick={() => pre.mutate()}>
            建立預覽
          </button>
          <button
            className={bc + " bg-[var(--color-primary)] text-white"}
            disabled={!preview || preview.issues.length > 0}
            onClick={() => pub.mutate()}
          >
            發布政策
          </button>
        </div>
        {preview ? (
          <div className="rounded bg-[var(--color-surface-offset)] p-3 text-sm">
            <b>
              預覽：{preview.previous?.name ?? "沒有舊版本"} → {preview.candidate.name}
            </b>
            {preview.issues.map((x, i) => (
              <p key={i} className="text-[var(--color-error)]">
                {x.path}：{x.message}
              </p>
            ))}
            {preview.manifest.map((x) => (
              <p key={x.id}>
                {x.title} · 名額 {x.capacity}
                {x.conflicts.length ? " · 衝突：" + x.conflicts.join("、") : ""}
              </p>
            ))}
          </div>
        ) : null}
      </section>
      <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
        <div>
          <h2 className="font-bold">複製已發布版本</h2>
          {versions.map((v) => (
            <button key={v.id} className={bc + " mr-2 border"} onClick={() => cp.mutate(v.id)}>
              {new Date(v.effective_from).toLocaleDateString("zh-HK")} · 複製
            </button>
          ))}
        </div>
        <div>
          <h2 className="font-bold">建立活動</h2>
          <input
            type="date"
            className={ic}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button className={bc + " mt-2 border"} disabled={!date} onClick={() => gen.mutate()}>
            建立當日活動
          </button>
        </div>
      </section>
      {dirty ? (
        <p role="status" className="text-sm text-[var(--color-warning)]">
          尚有未儲存變更；離開頁面前請先儲存。
        </p>
      ) : null}
      {note ? <p role="status">{note}</p> : null}
      {err ? (
        <p role="alert" className="whitespace-pre-line text-[var(--color-error)]">
          {err && typeof err === "object" && "status" in err && Number(err.status) === 409
            ? "草稿已被其他管理員更新，請重新載入。"
            : err instanceof Error
              ? err.message
              : "操作失敗。"}
        </p>
      ) : null}
    </div>
  );
}
