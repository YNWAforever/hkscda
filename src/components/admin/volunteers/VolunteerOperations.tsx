import { WorkflowSections } from "./WorkflowSections";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../../lib/supabase";
import { fetchAdminJson } from "../../../lib/admin/http";
import { TurnstileWidget, turnstileEnabled } from "../../site/TurnstileWidget";
import { VerifiedEmailSignIn, useCommandKey } from "../../site/volunteer/VerifiedEmailSignIn";
import type { OperationCommand } from "../../../lib/volunteers/policy/operations";
type Activity = {
  id: string;
  title: string;
  starts_at: string;
  capacity: number;
  group_headcount: number;
  roles: { key: string; label: string }[];
};
type Group = {
  id: string;
  activity_id: string;
  headcount: number;
  status: "pending" | "confirmed" | "cancelled";
  revision: number;
  contact_snapshot: {
    organisation: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
  };
};
type Registration = {
  id: string;
  activity_id: string;
  contact_name: string;
  status: string;
  duty_role: string;
  updated_at: string;
};
type Listing = {
  staff: boolean;
  activities: Activity[];
  enquiries: {
    id: string;
    organisation: string;
    contact_name: string;
    participant_count: number | null;
  }[];
  requests: Group[];
  registrations: Registration[];
};
type Preview = {
  preview_id: string;
  apply_action: "group_apply" | "move_apply";
  manifest: {
    volunteer_capacity?: number;
    group_headcount?: number;
    scenario?: string;
    capacity?: number;
    remaining?: number;
  };
  late?: boolean;
  contact_snapshot?: Group["contact_snapshot"];
};
const input =
  "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2";
const button =
  "min-h-11 rounded-md border border-[var(--color-border)] px-4 py-2 font-semibold disabled:opacity-50";
const time = (date: string) =>
  new Date(date).toLocaleString("zh-HK", { timeZone: "Asia/Hong_Kong", hour12: false });
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}
export function VolunteerOperations({ publicMode = false }: { publicMode?: boolean }) {
  const [session, setSession] = useState<{ token: string; userId: string }>();
  const qc = useQueryClient();
  const commandKey = useCommandKey();
  useEffect(() => {
    const client = getSupabaseClient();
    void client.auth
      .getSession()
      .then(({ data }) =>
        setSession(
          data.session
            ? { token: data.session.access_token, userId: data.session.user.id }
            : undefined,
        ),
      );
    const { data } = client.auth.onAuthStateChange((_event, s) =>
      setSession(s ? { token: s.access_token, userId: s.user.id } : undefined),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  const [captcha, setCaptcha] = useState("");
  const [reset, setReset] = useState(0);
  const [message, setMessage] = useState("");
  const [preview, setPreview] = useState<Preview>();
  const [reason, setReason] = useState("");
  const [enquiryId, setEnquiryId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [requestCount, setRequestCount] = useState(1);
  const [requestId, setRequestId] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [operation, setOperation] = useState<"confirm" | "cancel">("confirm");
  const [lateAck, setLateAck] = useState(false);
  const [registrationId, setRegistrationId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [role, setRole] = useState("volunteer");
  const endpoint = publicMode ? "/api/volunteer/operations" : "/api/admin/volunteers/operations";
  const api = <T,>(command: object) =>
    fetchAdminJson<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(
        publicMode ? { command, turnstileToken: captcha || undefined } : command,
      ),
    });
  const listing = useQuery({
    queryKey: ["volunteer-operations", publicMode, session?.userId],
    enabled: !!session,
    queryFn: () => api<Listing>({ action: "list" }),
  });
  const data = listing.data;
  const mutate = useMutation({
    mutationFn: (command: OperationCommand) =>
      api<{
        kind: string;
        preview_id?: string;
        manifest?: Preview["manifest"];
        late?: boolean;
        contact_snapshot?: Group["contact_snapshot"];
      }>(command),
    onSuccess: (result, command) => {
      if (result.kind === "preview" && result.preview_id) {
        setPreview({
          preview_id: result.preview_id,
          apply_action: command.action === "group_preview" ? "group_apply" : "move_apply",
          manifest: result.manifest ?? {},
          late: result.late,
          contact_snapshot: result.contact_snapshot,
        });
        setMessage("預覽完成；請核對下方資料後確認。");
      } else {
        setPreview(undefined);
        setMessage(
          result.kind === "requested"
            ? "團體申請已建立，尚未計入已確認人數。"
            : "變更已完成，名單及場次資料已更新。",
        );
        void qc.invalidateQueries({ queryKey: ["volunteer-operations"] });
        void qc.invalidateQueries({ queryKey: ["volunteer-calendar"] });
        void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
      }
    },
    onError: () => setPreview(undefined),
    onSettled: () => {
      if (publicMode) {
        setCaptcha("");
        setReset((v) => v + 1);
      }
    },
  });
  useEffect(
    () => setPreview(undefined),
    [requestId, headcount, operation, lateAck, registrationId, destinationId, role],
  );
  const selectedRequest = data?.requests.find((r) => r.id === requestId);
  const registration = data?.registrations.find((r) => r.id === registrationId);
  const destination = data?.activities.find((a) => a.id === destinationId);
  const busy = mutate.isPending;
  const protectedReady = !publicMode || !turnstileEnabled || !!captcha;
  const error = listing.error ?? mutate.error;
  const activityLabel = (id: string) => {
    const a = data?.activities.find((a) => a.id === id);
    return a ? `${a.title} · ${time(a.starts_at)}` : "原場次";
  };
  if (!session)
    return (
      <div className="space-y-4 p-4">
        <h1 className="text-2xl font-bold">團體申請及義工改期</h1>
        <VerifiedEmailSignIn />
      </div>
    );
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">團體申請及義工改期</h1>
        <p>所有時間為香港時間。團體查詢不等於已確認團體；確認及改期均重新檢查當前政策和名單。</p>
        <a className="underline" href={publicMode ? "/volunteer" : "/admin/volunteers/calendar"}>
          {publicMode ? "返回義工服務" : "返回義工月曆"}
        </a>
      </header>
      <WorkflowSections
        sections={[
          { id: "operations-create", label: "團體加入場次" },
          { id: "operations-records", label: "團體記錄" },
          { id: "operations-reschedule", label: "個人改期" },
        ]}
      />
      {listing.isLoading && <p>讀取資料中…</p>}
      {error && (
        <p role="alert">{error instanceof Error ? error.message : "操作未完成，請重新檢查。"}</p>
      )}
      {message && <p role="status">{message}</p>}
      {data && (
        <>
          <section className="space-y-4 rounded-lg border p-4">
            <h2 id="operations-create" className="text-lg font-bold">
              把團體查詢加入指定場次
            </h2>
            <p className="text-sm">聯絡資料會保存為本次申請的快照。提交後仍待職員核實。</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="已有團體查詢">
                <select
                  aria-label="已有團體查詢"
                  className={input}
                  value={enquiryId}
                  onChange={(e) => {
                    setEnquiryId(e.target.value);
                    setRequestCount(
                      data.enquiries.find((x) => x.id === e.target.value)?.participant_count ?? 1,
                    );
                  }}
                >
                  <option value="">請選擇</option>
                  {data.enquiries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.organisation} · {e.contact_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="希望參加的場次">
                <select
                  aria-label="希望參加的場次"
                  className={input}
                  value={activityId}
                  onChange={(e) => setActivityId(e.target.value)}
                >
                  <option value="">請選擇</option>
                  {data.activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} · {time(a.starts_at)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="團體人數">
                <input
                  className={input}
                  type="number"
                  min={1}
                  max={100000}
                  value={requestCount}
                  onChange={(e) => setRequestCount(Number(e.target.value))}
                />
              </Field>
            </div>
            <button
              className={button}
              disabled={!enquiryId || !activityId || requestCount < 1 || busy || !protectedReady}
              onClick={() => {
                const body = {
                  action: "request" as const,
                  activity_id: activityId,
                  enquiry_id: enquiryId,
                  headcount: requestCount,
                };
                mutate.mutate({ ...body, idempotency_key: commandKey(body) });
              }}
            >
              提交待確認團體
            </button>
            {data.enquiries.length === 0 && (
              <p>未有與此已驗證電郵相符的團體查詢。請先提交團體查詢，或聯絡職員協助。</p>
            )}
          </section>
          <section className="space-y-3 rounded-lg border p-4">
            <h2 id="operations-records" className="text-lg font-bold">
              團體申請記錄
            </h2>
            {data.requests.map((r) => (
              <p key={r.id}>
                {r.contact_snapshot.organisation} · {r.headcount} 人 ·{" "}
                {{ pending: "待確認", confirmed: "已確認", cancelled: "已取消" }[r.status]} ·{" "}
                {activityLabel(r.activity_id)}
              </p>
            ))}
            {data.requests.length === 0 && <p>尚未有團體申請。</p>}
          </section>
          {data.staff && !publicMode && (
            <section className="space-y-4 rounded-lg border p-4">
              <h2 className="text-lg font-bold">確認團體、調整人數或取消</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label="團體申請">
                  <select
                    aria-label="團體申請"
                    className={input}
                    value={requestId}
                    onChange={(e) => {
                      setRequestId(e.target.value);
                      setHeadcount(
                        data.requests.find((r) => r.id === e.target.value)?.headcount ?? 1,
                      );
                    }}
                  >
                    <option value="">請選擇</option>
                    {data.requests
                      .filter((r) => r.status !== "cancelled")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.contact_snapshot.organisation} · {activityLabel(r.activity_id)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label="操作">
                  <select
                    aria-label="操作"
                    className={input}
                    value={operation}
                    onChange={(e) =>
                      setOperation(e.target.value === "cancel" ? "cancel" : "confirm")
                    }
                  >
                    <option value="confirm">確認／調整人數</option>
                    <option value="cancel">取消團體</option>
                  </select>
                </Field>
                <Field label="確認人數">
                  <input
                    className={input}
                    type="number"
                    min={1}
                    disabled={operation === "cancel"}
                    value={headcount}
                    onChange={(e) => setHeadcount(Number(e.target.value))}
                  />
                </Field>
              </div>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={lateAck}
                  onChange={(e) => setLateAck(e.target.checked)}
                />
                如已過團體凍結截點，確認已人工核對此臨時變更
              </label>
              <button
                className={button}
                disabled={!selectedRequest || busy}
                onClick={() =>
                  selectedRequest &&
                  mutate.mutate({
                    action: "group_preview",
                    request_id: selectedRequest.id,
                    expected_revision: selectedRequest.revision,
                    operation,
                    headcount: operation === "cancel" ? 0 : headcount,
                    acknowledge_late_change: lateAck,
                  })
                }
              >
                預覽團體影響
              </button>
            </section>
          )}
          <section className="space-y-4 rounded-lg border p-4">
            <h2 id="operations-reschedule" className="text-lg font-bold">
              義工改期
            </h2>
            <p className="text-sm">
              原報名會保留，直至目的場次通過資格、名額、重疊及條款檢查後才原子更新。已有出席紀錄不能透過改期改寫。
            </p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label="現有報名">
                <select
                  aria-label="現有報名"
                  className={input}
                  value={registrationId}
                  onChange={(e) => setRegistrationId(e.target.value)}
                >
                  <option value="">請選擇</option>
                  {data.registrations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.contact_name} · {activityLabel(r.activity_id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="目的場次">
                <select
                  aria-label="目的場次"
                  className={input}
                  value={destinationId}
                  onChange={(e) => {
                    setDestinationId(e.target.value);
                    setRole(
                      data.activities.find((a) => a.id === e.target.value)?.roles[0]?.key ??
                        "volunteer",
                    );
                  }}
                >
                  <option value="">請選擇</option>
                  {data.activities
                    .filter((a) => a.id !== registration?.activity_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} · {time(a.starts_at)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label="目的職務">
                <select
                  aria-label="目的職務"
                  className={input}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {destination?.roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              className={button}
              disabled={!registration || !destination || busy || !protectedReady}
              onClick={() =>
                registration &&
                mutate.mutate({
                  action: "move_preview",
                  registration_id: registration.id,
                  expected_updated_at: registration.updated_at,
                  activity_id: destinationId,
                  role,
                })
              }
            >
              預覽改期影響
            </button>
          </section>
          {preview && (
            <section className="space-y-4 rounded-lg border p-4">
              <h2 className="text-lg font-bold">確認此變更</h2>
              {preview.apply_action === "group_apply" ? (
                <>
                  <p>
                    團體總人數：{preview.manifest.group_headcount}；可供義工使用的總位：
                    {preview.manifest.volunteer_capacity}；情況：
                    {preview.manifest.scenario === "confirmed_group" ? "A 有團體" : "B 無團體"}。
                  </p>
                  {preview.contact_snapshot && (
                    <p>
                      {preview.contact_snapshot.organisation} ·{" "}
                      {preview.contact_snapshot.contact_name} ·{" "}
                      {preview.contact_snapshot.contact_phone}
                    </p>
                  )}
                  {preview.late && <p>這是凍結截點後的人工核對變更。</p>}
                </>
              ) : (
                <p>
                  目的場次總位 {preview.manifest.capacity}，目前剩餘 {preview.manifest.remaining}
                  。確認前伺服器會再次檢查。
                </p>
              )}
              <Field label="變更原因">
                <textarea
                  aria-label="變更原因"
                  className={input}
                  maxLength={1000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </Field>
              <button
                className={button}
                disabled={!reason.trim() || busy || !protectedReady}
                onClick={() => {
                  const body = {
                    action: preview.apply_action,
                    preview_id: preview.preview_id,
                    reason,
                  };
                  mutate.mutate({ ...body, idempotency_key: commandKey(body) });
                }}
              >
                確認套用變更
              </button>
            </section>
          )}
        </>
      )}
      {publicMode && turnstileEnabled && (
        <TurnstileWidget resetKey={reset} onVerify={setCaptcha} onExpire={() => setCaptcha("")} />
      )}
    </div>
  );
}
