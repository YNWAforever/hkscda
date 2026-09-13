import { WorkflowSections } from "../../../components/admin/volunteers/WorkflowSections";
import { VolunteerAdminShell } from "../../../components/admin/VolunteerAdminShell";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
import { fetchAdminJson } from "../../../lib/admin/http";
import { initialMonthlyPolicy } from "../../../lib/volunteers/policy/catalogue";
import { monthlyPolicySchema } from "../../../lib/volunteers/policy/schemas";
type P = typeof initialMonthlyPolicy;
type Job = {
  id: string;
  kind: string;
  status: string;
  attempts: number;
  available_at: string;
  last_error: string | null;
};
type Listed = {
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
const c = "min-h-10 rounded-md border px-2 py-1.5";
type AssessmentApiResult = Listed & {
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
export const Route = createFileRoute("/admin/volunteers/assessments")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("volunteerPolicyManagement", context.queryClient);
  },
  component: AssessmentWorkspace,
});
function Page() {
  const [p, setP] = useState<P>(initialMonthlyPolicy),
    [rev, setRev] = useState(0),
    [data, setData] = useState<Listed>({}),
    [msg, setMsg] = useState(""),
    [reason, setReason] = useState(""),
    [effective, setEffective] = useState(new Date().toISOString().slice(0, 10)),
    [month, setMonth] = useState(""),
    [scope, setScope] = useState("combined"),
    [jobs, setJobs] = useState<Job[]>([]);
  const load = () =>
    cmd({ kind: "list" })
      .then((x) => {
        setData(x);
        if (x.draft) {
          setP(monthlyPolicySchema.parse(x.draft.body));
          setRev(x.draft.revision);
        }
      })
      .catch((e) => setMsg(e.message));
  const loadJobs = () =>
    fetchAdminJson<{ jobs: Job[] }>("/api/admin/volunteers/jobs/").then((x) => setJobs(x.jobs));
  useEffect(() => {
    void load();
  }, []);
  const change = <K extends keyof P>(k: K, v: P[K]) => setP((q) => ({ ...q, [k]: v }));
  const value = (v: unknown) => (typeof v === "string" ? v : "");
  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-bold">每月義工級別評核</h1>
        <WorkflowSections
          sections={[
            { id: "assessment-settings", label: "評核設定" },
            { id: "assessment-run", label: "執行評核" },
            { id: "assessment-candidates", label: "候選核准" },
            { id: "assessment-notifications", label: "通知狀態" },
          ]}
        />
        <span id="assessment-settings" />
        <p className="text-sm text-[var(--color-text-muted)]">
          所有時段以香港時間計算。未知歷史覆蓋不會當作零出席，資深義工不會自動降級。
        </p>
      </header>
      <section className="grid gap-3 rounded-lg border bg-white p-4 md:grid-cols-3">
        <label>
          晉升恆常累積出席
          <input
            className={c}
            type="number"
            value={p.regular_attendance_threshold}
            onChange={(e) => change("regular_attendance_threshold", +e.target.value)}
          />
        </label>
        <label>
          資深年資
          <input
            className={c}
            type="number"
            value={p.senior_years}
            onChange={(e) => change("senior_years", +e.target.value)}
          />
        </label>
        <label>
          資深恆常觀察月數
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
          出席計算
          <select
            className={c}
            value={value(p.attendance_unit)}
            onChange={(e) => change("attendance_unit", e.target.value as P["attendance_unit"])}
          >
            <option value="">待決定</option>
            <option value="once_per_day">同日只計一次</option>
            <option value="each_verified_nonoverlapping_session">每個核實且不重疊時段</option>
          </select>
        </label>
        <label>
          場地範圍
          <select
            className={c}
            value={value(p.shelter_scope)}
            onChange={(e) => change("shelter_scope", e.target.value as P["shelter_scope"])}
          >
            <option value="">待決定</option>
            <option value="combined">貓狗合計</option>
            <option value="separate">貓狗分開</option>
          </select>
        </label>
        <label>
          晉升評核時點
          <select
            className={c}
            value={value(p.promotion_trigger)}
            onChange={(e) => change("promotion_trigger", e.target.value as P["promotion_trigger"])}
          >
            <option value="">待決定</option>
            <option value="verified_attendance">每次核實出席</option>
            <option value="monthly_assessment">每月評核</option>
          </select>
        </label>
        <label>
          恆常每月最低
          <input
            className={c}
            type="number"
            value={p.regular_monthly_minimum}
            onChange={(e) => change("regular_monthly_minimum", +e.target.value)}
          />
        </label>
        <label>
          資深每月最低
          <input
            className={c}
            type="number"
            value={p.senior_monthly_minimum}
            onChange={(e) => change("senior_monthly_minimum", +e.target.value)}
          />
        </label>
        <label>
          恆常提醒相隔零出席月數
          <input
            className={c}
            type="number"
            value={p.regular_zero_months}
            onChange={(e) => change("regular_zero_months", +e.target.value)}
          />
        </label>
        <label>
          資深提醒相隔零出席月數
          <input
            className={c}
            type="number"
            value={p.senior_zero_months}
            onChange={(e) => change("senior_zero_months", +e.target.value)}
          />
        </label>
        <label>
          每月執行日
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
          香港時間
          <input
            className={c}
            type="time"
            value={value(p.assessment_time)}
            onChange={(e) => change("assessment_time", e.target.value as P["assessment_time"])}
          />
        </label>
        <label className="md:col-span-3">
          恆常提醒內容
          <textarea
            className={c + " w-full"}
            value={p.notifications.regular_template}
            onChange={(e) =>
              change("notifications", { ...p.notifications, regular_template: e.target.value })
            }
          />
        </label>
        <label className="md:col-span-3">
          資深關懷內容
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
          啟用通知佇列
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
            ? "電郵（已配置）"
            : "電郵（未配置；只可測試）"}
        </label>
        <label>
          <input
            type="checkbox"
            checked={p.notifications.dry_run}
            onChange={(e) =>
              change("notifications", { ...p.notifications, dry_run: e.target.checked })
            }
          />{" "}
          測試模式（只建立佇列，不會發送）
        </label>
      </section>
      <div className="flex flex-wrap gap-2">
        <button
          className={c}
          onClick={() =>
            cmd({ kind: "save", body: p, expected_revision: rev })
              .then((x) => {
                setRev(x.draft.revision);
                setMsg("草稿已儲存");
              })
              .catch((e) => setMsg(e.message))
          }
        >
          儲存草稿
        </button>
        <button
          className={c}
          onClick={() =>
            cmd({ kind: "preview" })
              .then((x) => setMsg(x.ready ? "預覽通過，可以發布" : "仍有待決定設定，暫不可發布"))
              .catch((e) => setMsg(e.message))
          }
        >
          預覽
        </button>
        <input
          className={c}
          type="date"
          aria-label="評核政策生效日期"
          value={effective}
          onChange={(e) => setEffective(e.target.value)}
        />
        <input
          className={c}
          placeholder="發布原因"
          aria-label="發布原因"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <button
          className={c}
          disabled={!reason || !rev}
          onClick={() =>
            cmd({ kind: "publish", expected_revision: rev, effective_from: effective, reason })
              .then(() => {
                setMsg("版本已發布");
                load();
              })
              .catch((e) => setMsg(e.message))
          }
        >
          發布版本
        </button>
      </div>
      <section className="rounded-lg border bg-white p-4">
        <h2 id="assessment-run" className="font-bold">
          執行已完成月份
        </h2>
        <input
          className={c}
          type="month"
          aria-label="已完成評核月份"
          value={month}
          onChange={(e) => setMonth(e.target.value)}
        />
        <select
          aria-label="評核範圍"
          className={c}
          value={scope}
          onChange={(e) => setScope(e.target.value)}
        >
          <option value="combined">貓狗合計</option>
          <option value="cat">貓舍</option>
          <option value="dog">狗舍</option>
        </select>
        <button
          className={c}
          disabled={!month}
          onClick={() =>
            cmd({ kind: "run", period_start: month + "-01", scope_key: scope })
              .then((x) => {
                setMsg(`評核完成：${x.profiles} 人；通知已排入佇列，未標示為已送達`);
                load();
              })
              .catch((e) => setMsg(e.message))
          }
        >
          執行評核
        </button>
        <ul className="mt-2 text-sm">
          {data.assessments?.map((a) => (
            <li key={a.id}>
              {a.period_start} · {a.scope_key} · 已完成
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 id="assessment-candidates" className="font-bold">
          資深義工候選（須人手核准）
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          候選只按已發布政策及已核實年資／恆常觀察證據產生，不會自動晉升。
        </p>
        <ul className="mt-2 text-sm">
          {data.senior_candidates?.map((candidate) => (
            <li key={candidate.id}>
              義工 {candidate.profile?.display_name ?? "未命名義工"} ·{" "}
              {candidate.trigger_kind === "verified_attendance" ? "核實出席觸發" : "每月評核觸發"} ·{" "}
              {candidate.detected_at}
            </li>
          ))}
        </ul>
      </section>{" "}
      <section className="rounded-lg border bg-white p-4">
        <h2 id="assessment-notifications" className="font-bold">
          通知工作
        </h2>
        <p className="text-sm text-[var(--color-text-muted)]">
          供應商接受不等於已送達；只有回傳送達證據才會顯示已送達。
        </p>
        <ul className="space-y-2">
          {jobs.map((job) => (
            <li key={job.id} className="flex flex-wrap items-center gap-2 text-sm">
              <span>
                {job.kind} · {job.status} · 嘗試 {job.attempts}
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
                        setMsg("通知已重新排隊");
                        void loadJobs();
                      })
                      .catch((e) => setMsg(e.message))
                  }
                >
                  重新排隊
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>
      {msg && <p role="status">{msg}</p>}
    </div>
  );
}
function AssessmentWorkspace() {
  return (
    <VolunteerAdminShell>
      <Page />
    </VolunteerAdminShell>
  );
}
