import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
type Listing = {
  drafts: {
    template_key: string;
    name: string;
    revision: number;
    roles: { key: string; label: string }[];
  }[];
  profiles: { id: string; name: string; tier: string }[];
  activities: { id: string; title: string; starts_at: string; template_key: string }[];
};
type Simulation = {
  simulation_only: boolean;
  evaluation: {
    allowed: boolean;
    reason: string;
    capacity?: number;
    confirmed?: number;
    remaining?: number;
    next_boundary?: string;
  };
};
const endpoint = "/api/admin/volunteers/simulation/";
const send = <T,>(body: unknown) =>
  fetchAdminJson<T>(endpoint, { method: "POST", body: JSON.stringify(body) });
const input = "min-h-11 min-w-0 w-full rounded border px-3 py-2";
const reasons: Record<string, string> = {
  available: "可以報名",
  capacity_full: "總容量已滿",
  role_full: "職務上限已滿",
  tier_quota_full: "級別配額已滿",
  daily_quota_full: "全日配額已滿",
  reserved_for_core_role: "保留核心職務名額",
  credentials_required: "缺少所需資格",
  role_not_allowed: "未符合此職務資格",
  tier_not_allowed: "未符合級別限制",
  tier_weekday_not_allowed: "級別不適用於當日",
  date_closed: "當日不開放",
  activity_closed: "場次已關閉或模擬時間已過開場",
  registration_not_open: "尚未開放報名",
  registration_closed: "已過截止",
  group_scenario_mismatch: "團體狀態與 A／B 政策不符",
  daily_scope_requires_review: "此草稿改動全日政策，請先使用全日設定預覽",
  minimum_age_not_met: "未符合最低年齡",
  overlapping_duty: "當值時間重疊",
};
export function VolunteerPolicySimulation() {
  const listing = useQuery({
    queryKey: ["volunteer-policy-simulation"],
    queryFn: () => send<Listing>({ action: "list" }),
  });
  const [template, setTemplate] = useState("");
  const [activity, setActivity] = useState("");
  const [profile, setProfile] = useState("");
  const [role, setRole] = useState("volunteer");
  const [time, setTime] = useState("");
  const draft = listing.data?.drafts.find((d) => d.template_key === template);
  const simulate = useMutation({
    mutationFn: () =>
      send<Simulation>({
        action: "simulate",
        template_key: template,
        draft_revision: draft?.revision,
        activity_id: activity,
        profile_id: profile,
        role,
        simulation_time: new Date(time + ":00+08:00").toISOString(),
      }),
  });
  const change = (setter: (v: string) => void, value: string) => {
    setter(value);
    simulate.reset();
  };
  return (
    <section className="space-y-5 p-4 md:p-6">
      <h1 className="text-2xl font-bold">政策模擬</h1>
      <p>
        選擇已儲存草稿、現有場次、已核實義工和香港時間，使用與報名相同的規則試算。模擬不會報名、發布、釋放一次名額或發送通知。
      </p>
      <a className="underline" href="/admin/volunteers/settings">
        返回政策設定
      </a>
      {listing.error && <p role="alert">未能載入模擬資料</p>}
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          simulate.mutate();
        }}
      >
        <label className="grid min-w-0 gap-1">
          已儲存草稿
          <select
            aria-label="已儲存草稿"
            required
            className={input}
            value={template}
            onChange={(e) => {
              change(setTemplate, e.target.value);
              setRole(
                listing.data?.drafts.find((d) => d.template_key === e.target.value)?.roles[0]
                  ?.key ?? "volunteer",
              );
            }}
          >
            <option value="">請選擇</option>
            {listing.data?.drafts.map((d) => (
              <option key={d.template_key} value={d.template_key}>
                {d.name}（草稿版本 {d.revision}）
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          場次日期
          <select
            aria-label="場次日期"
            required
            className={input}
            value={activity}
            onChange={(e) => change(setActivity, e.target.value)}
          >
            <option value="">請選擇</option>
            {listing.data?.activities.map((a) => (
              <option key={a.id} value={a.id}>
                {new Date(a.starts_at).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong" })} ·{" "}
                {a.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          已核實義工
          <select
            aria-label="已核實義工"
            required
            className={input}
            value={profile}
            onChange={(e) => change(setProfile, e.target.value)}
          >
            <option value="">請選擇</option>
            {listing.data?.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}（
                {
                  ({ newcomer: "新手", regular: "普通", senior: "資深" } as Record<string, string>)[
                    p.tier
                  ]
                }
                ）
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          職務
          <select
            aria-label="職務"
            required
            className={input}
            value={role}
            onChange={(e) => change(setRole, e.target.value)}
          >
            {draft?.roles.map((r) => (
              <option key={r.key} value={r.key}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          模擬香港時間
          <input
            required
            type="datetime-local"
            className={input}
            value={time}
            onChange={(e) => change(setTime, e.target.value)}
          />
        </label>
        <button
          className="min-h-11 rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
          disabled={simulate.isPending || !draft}
        >
          執行模擬
        </button>
      </form>
      {simulate.error && (
        <p role="alert">未能模擬：請先確認草稿所有待設定欄位，並重新載入最新版本。</p>
      )}
      {simulate.data && (
        <section aria-live="polite" className="space-y-2 rounded border p-4">
          <h2 className="font-bold">
            模擬結果：{simulate.data.evaluation.allowed ? "可以報名" : "不符合條件"}
          </h2>
          <p>
            {reasons[simulate.data.evaluation.reason] ?? "未符合此草稿規則，請核對場次及資格設定。"}
          </p>
          <p>
            有效容量 {simulate.data.evaluation.capacity ?? "—"} · 已確認{" "}
            {simulate.data.evaluation.confirmed ?? "—"} · 餘額{" "}
            {simulate.data.evaluation.remaining ?? "—"}
          </p>
          {simulate.data.evaluation.next_boundary && (
            <p>
              下一規則邊界：
              {new Date(simulate.data.evaluation.next_boundary).toLocaleString("zh-HK", {
                timeZone: "Asia/Hong_Kong",
              })}
            </p>
          )}
          <p className="text-sm">結果只對本次模擬時間及資料有效，實際報名會重新檢查。</p>
        </section>
      )}
    </section>
  );
}
