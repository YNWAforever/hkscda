import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
type Row = {
  id: string;
  kind: string;
  title?: string;
  contact_name?: string;
  activity_id?: string;
  registration_id?: string;
  created_at?: string;
  starts_at?: string;
  status?: string;
  last_error?: string;
  attempts?: number;
};
type Data = { tasks: Row[]; pending: Row[]; notifications: Row[] };
const post = <T,>(command: object) =>
  fetchAdminJson<T>("/api/admin/volunteers/tasks", {
    method: "POST",
    body: JSON.stringify(command),
  });
const kind: Record<string, string> = {
  volunteer_booking_changed: "報名／取消／條款更新",
  volunteer_qualification_review: "資格例外待核實",
  volunteer_operation_changed: "團體／改期跟進",
  volunteer_policy_contact: "政策／時間變更：聯絡已報名人士",
  volunteer_monthly_assessment_notification: "月度出席提示",
  volunteer_policy_reminder: "服務提醒",
};
const statuses: Record<string, string> = {
  queued: "等候處理",
  claimed: "處理中",
  failed: "失敗",
  provider_accepted: "供應商已接收",
  delivered: "已有送達證據",
};
export function VolunteerTasks() {
  const cache = useQueryClient();
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const query = useQuery({
    queryKey: ["volunteer-tasks"],
    queryFn: () => post<Data>({ action: "list" }),
    refetchInterval: 30000,
  });
  const mutation = useMutation({
    mutationFn: (command: object) => post(command),
    onSuccess: async () => {
      setSelected("");
      setReason("");
      await cache.invalidateQueries({ queryKey: ["volunteer-tasks"] });
    },
  });
  const target = (row: Row) => (
    <a
      className="underline"
      href={
        row.registration_id || !row.kind
          ? `/admin/volunteers/registrations/${encodeURIComponent(row.registration_id || row.id)}`
          : "/admin/volunteers/operations"
      }
    >
      開啟{row.title || "相關工作"}
    </a>
  );
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">義工今日待辦與通知</h1>
        <p>記錄聯絡及跟進結果不會更改資格、名額或批准結果，也不等同訊息已送達。</p>
        <a href="/admin/volunteers/calendar" className="underline">
          月曆：查看缺人、資格例外及場次詳情
        </a>
      </header>
      {query.isLoading && <p>載入中…</p>}
      {query.error && <p role="alert">未能載入待辦</p>}
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">待審批</h2>
        {query.data?.pending.length === 0 && <p>目前沒有待審批報名。</p>}
        {query.data?.pending.map((row) => (
          <article key={row.id} className="rounded border p-3">
            {row.contact_name} · {target(row)}
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">待聯絡／核實</h2>
        {query.data?.tasks.length === 0 && <p>目前沒有未完成跟進。</p>}
        {query.data?.tasks.map((row) => (
          <article key={row.id} className="space-y-2 rounded border p-3">
            <p>
              {kind[row.kind] ?? "營運跟進"} · {row.contact_name} · {target(row)}
            </p>
            <button className="min-h-11 underline" onClick={() => setSelected(row.id)}>
              記錄跟進結果
            </button>
            {selected === row.id && (
              <div>
                <label>
                  處理結果與聯絡紀錄
                  <textarea
                    className="block min-h-24 w-full rounded border p-2"
                    maxLength={1000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
                <button
                  className="min-h-11 rounded border px-4"
                  disabled={!reason.trim() || mutation.isPending}
                  onClick={() => mutation.mutate({ action: "complete", id: row.id, reason })}
                >
                  完成此項跟進
                </button>
              </div>
            )}
          </article>
        ))}
      </section>
      <section className="space-y-3">
        <h2 className="text-xl font-semibold">通知處理狀態</h2>
        {query.data?.notifications.map((row) => (
          <article key={row.id} className="rounded border p-3">
            <p>
              {kind[row.kind] ?? "通知"} · {statuses[row.status ?? ""] ?? "待核實"} · 已嘗試{" "}
              {row.attempts} 次
            </p>
            {row.last_error && <p>原因：{row.last_error}</p>}
            {row.status === "failed" && (
              <button
                className="min-h-11 underline"
                disabled={mutation.isPending}
                onClick={() => mutation.mutate({ action: "retry", id: row.id })}
              >
                重試此通知
              </button>
            )}
          </article>
        ))}
      </section>
    </section>
  );
}
