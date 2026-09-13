import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import { fetchAdminJson } from "../../../lib/admin/http";
import { intakeSchema } from "../../../lib/internships/service";
import {
  internshipStatuses,
  type InternshipApplication,
  type IntakeBody,
} from "../../site/InternshipForm";
const field = "block w-full rounded border border-[var(--color-border)] p-2";
const post = <T,>(body: object) =>
  fetchAdminJson<T>("/api/admin/internships", { method: "POST", body: JSON.stringify(body) });
function IntakeSettings() {
  const [body, setBody] = useState<IntakeBody>();
  const [preview, setPreview] = useState<{
    preview_id: string;
    before: IntakeBody;
    after: IntakeBody;
    existing_applications_preserved: number;
  }>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const q = useQuery({
    queryKey: ["internship-settings"],
    queryFn: () =>
      post<{
        draft: { body: IntakeBody; revision: number };
        current: { body: IntakeBody };
        history: { id: string; body: IntakeBody; reason: string }[];
      }>({ action: "settings" }),
  });
  const value = body ?? q.data?.draft.body;
  const act = async (action: "save_intake" | "preview_intake" | "publish_intake") => {
    setBusy(true);
    setError("");
    try {
      if (action === "save_intake") {
        await post({
          action,
          body: intakeSchema.parse(value),
          expected_revision: q.data?.draft.revision,
        });
        setBody(undefined);
        setPreview(undefined);
        await q.refetch();
        setNotice("草稿已儲存，未影響目前申請。");
      } else if (action === "preview_intake") {
        setPreview(await post({ action, expected_revision: q.data?.draft.revision }));
      } else {
        await post({
          action,
          preview_id: preview?.preview_id,
          idempotency_key: crypto.randomUUID(),
          reason,
        });
        setPreview(undefined);
        await q.refetch();
        setNotice("新版本已發布；既有申請及核實證據保留。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "設定未能儲存");
    } finally {
      setBusy(false);
    }
  };
  if (!value) return <p>載入實習收生設定…</p>;
  return (
    <details className="space-y-4 rounded border p-4">
      <summary className="cursor-pointer font-semibold">管理員收生設定與版本</summary>
      <p>
        目前：{q.data?.current.body.enabled ? "接受新申請" : "暫停新申請"}。先儲存草稿，再預覽發布。
      </p>
      <label className="block">
        標題
        <input
          className={field}
          maxLength={150}
          value={value.name}
          onChange={(e) => {
            setBody({ ...value, name: e.target.value });
            setPreview(undefined);
          }}
        />
      </label>
      <label className="block">
        <input
          type="checkbox"
          checked={value.enabled}
          onChange={(e) => {
            setBody({ ...value, enabled: e.target.checked });
            setPreview(undefined);
          }}
        />
        接受新申請
      </label>
      <fieldset>
        <legend>服務場地</legend>
        {["cat", "dog"].map((key) => (
          <label key={key} className="mr-4">
            <input
              type="checkbox"
              checked={value.shelters.includes(key)}
              onChange={(e) => {
                setBody({
                  ...value,
                  shelters: e.target.checked
                    ? [...value.shelters, key]
                    : value.shelters.filter((s) => s !== key),
                });
                setPreview(undefined);
              }}
            />
            {key === "cat" ? "貓舍" : "狗舍"}
          </label>
        ))}
      </fieldset>
      {(["opens_at", "closes_at"] as const).map((key) => (
        <label className="block" key={key}>
          {key === "opens_at" ? "開放時間" : "截止時間"}（香港時間，留空不設限制）
          <input
            type="datetime-local"
            className={field}
            value={
              value[key]
                ? new Date(Date.parse(value[key]!) + 8 * 3600000).toISOString().slice(0, 16)
                : ""
            }
            onChange={(e) => {
              setBody({ ...value, [key]: e.target.value ? e.target.value + ":00+08:00" : null });
              setPreview(undefined);
            }}
          />
        </label>
      ))}
      <label className="block">
        申請指引
        <textarea
          className={field}
          maxLength={3000}
          value={value.instructions}
          onChange={(e) => {
            setBody({ ...value, instructions: e.target.value });
            setPreview(undefined);
          }}
        />
      </label>
      <div className="flex gap-3">
        <button
          disabled={busy}
          className="rounded border px-4 py-2"
          onClick={() => act("save_intake")}
        >
          儲存草稿
        </button>
        <button
          disabled={busy || Boolean(body)}
          className="rounded border px-4 py-2"
          onClick={() => act("preview_intake")}
        >
          預覽發布
        </button>
      </div>
      {preview && (
        <div className="space-y-3 rounded border p-4">
          <h3>發布前後</h3>
          <p>
            {preview.before.name} → {preview.after.name}
          </p>
          <p>
            {preview.before.enabled ? "開放" : "暫停"} → {preview.after.enabled ? "開放" : "暫停"}
          </p>
          <p>
            場地：{preview.after.shelters.map((s) => (s === "cat" ? "貓舍" : "狗舍")).join("、")}
          </p>
          <p>保留{preview.existing_applications_preserved}份既有申請，已提交資料不重寫。</p>
          <label>
            發布理由
            <textarea
              className={field}
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button
            disabled={busy || !reason.trim()}
            className="rounded border px-4 py-2"
            onClick={() => act("publish_intake")}
          >
            確認發布新版本
          </button>
        </div>
      )}
      <h3>版本歷史</h3>
      {q.data?.history.map((v) => (
        <p key={v.id}>
          {v.body.name} · {v.reason}{" "}
          <button
            className="underline"
            onClick={() => {
              setBody(v.body);
              setPreview(undefined);
            }}
          >
            複製為新草稿
          </button>
        </p>
      ))}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </details>
  );
}
export function InternshipManagement() {
  const identity = useQuery(adminIdentityQueryOptions());
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["internships"],
    queryFn: () => post<{ applications: InternshipApplication[] }>({ action: "list" }),
  });
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("needs_information");
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const app = q.data?.applications.find((a) => a.id === selected);
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">獸醫學生實習申請</h1>
      <p>獨立於一般義工級別及時段名額。原客戶申請表尚未提供；以下為基本學生核實流程。</p>
      {identity.data?.admin?.role === "admin" && <IntakeSettings />}
      <label className="block">
        申請人
        <select
          className={field}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setVerified(false);
            setReason("");
            setEvidence("");
          }}
        >
          <option value="">選擇申請</option>
          {q.data?.applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.contact_snapshot.name} · {a.student_snapshot.institution} ·{" "}
              {internshipStatuses[a.status]}
            </option>
          ))}
        </select>
      </label>
      {q.isLoading && <p>載入中…</p>}
      {q.error && <p role="alert">未能載入實習申請</p>}
      {app && (
        <article className="space-y-4 rounded border p-4">
          <h2 className="font-semibold">
            {app.contact_snapshot.name} · {internshipStatuses[app.status]}
          </h2>
          <p>
            {app.contact_snapshot.email} · {app.contact_snapshot.phone}
          </p>
          <p>
            {app.student_snapshot.institution} · {app.student_snapshot.course} ·{" "}
            {app.shelter === "cat" ? "貓舍" : "狗舍"}
          </p>
          <p className="whitespace-pre-wrap">{app.student_snapshot.statement}</p>
          <ul>
            {app.attachments.map((f) => (
              <li key={f.id}>
                <button
                  className="underline"
                  onClick={async () => {
                    try {
                      const data = await fetchAdminJson<{ url: string }>(
                        `/api/internships/attachment?id=${f.id}`,
                      );
                      window.open(data.url, "_blank", "noopener,noreferrer");
                    } catch {
                      setError("未能開啟私人附件");
                    }
                  }}
                >
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
          <h3>審核及補充紀錄</h3>
          {app.events.map((e) => (
            <p key={e.id}>
              {e.detail.reason ?? e.detail.statement ?? "資料已記錄"}
              {e.detail.evidence && ` · ${e.detail.evidence}`}
            </p>
          ))}
          {["submitted", "needs_information"].includes(app.status) && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError("");
                try {
                  await post({
                    action: "review",
                    application_id: app.id,
                    expected_revision: app.revision,
                    idempotency_key: crypto.randomUUID(),
                    status,
                    reason,
                    student_verified: verified,
                    evidence,
                  });
                  await qc.invalidateQueries({ queryKey: ["internships"] });
                } catch (e) {
                  setError(e instanceof Error ? e.message : "未能完成審核");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                處理結果
                <select
                  className={field}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="needs_information">要求補充資料</option>
                  <option value="approved">批准</option>
                  <option value="rejected">不批准</option>
                </select>
              </label>
              <label className="block">
                審核理由
                <textarea
                  required
                  className={field}
                  maxLength={2000}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  checked={verified}
                  onChange={(e) => setVerified(e.target.checked)}
                />
                已核實獸醫學生身份及所屬院校／課程
              </label>
              <label className="block">
                核實證據來源
                <textarea
                  className={field}
                  required={status === "approved"}
                  maxLength={2000}
                  value={evidence}
                  onChange={(e) => setEvidence(e.target.value)}
                />
              </label>
              <button
                className="rounded border px-4 py-2"
                disabled={busy || (status === "approved" && !verified)}
              >
                保存審核決定
              </button>
            </form>
          )}
        </article>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
