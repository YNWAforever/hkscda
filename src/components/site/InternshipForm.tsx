import { useCallback, useEffect, useState } from "react";
import {
  VerifiedEmailSignIn,
  useVerifiedSession,
  useCommandKey,
} from "./volunteer/VerifiedEmailSignIn";
export type InternshipApplication = {
  id: string;
  revision: number;
  status: string;
  shelter: string;
  contact_snapshot: { name: string; email: string; phone: string };
  student_snapshot: { institution: string; course: string; statement: string };
  events: {
    id: string;
    kind: string;
    detail: { reason?: string; statement?: string; evidence?: string };
  }[];
  attachments: { id: string; label: string }[];
};
export const internshipStatuses: Record<string, string> = {
  submitted: "待審核",
  needs_information: "待補資料",
  approved: "已批准",
  rejected: "未獲批准",
  withdrawn: "已撤回",
};
export type IntakeBody = {
  enabled: boolean;
  name: string;
  shelters: string[];
  opens_at: string | null;
  closes_at: string | null;
  instructions: string;
};
const field = "block w-full rounded border border-[var(--color-border)] p-2";
export function InternshipForm() {
  const token = useVerifiedSession(),
    commandKey = useCommandKey();
  const [intake, setIntake] = useState<{ version: string; settings: IntakeBody }>();
  const [applications, setApplications] = useState<InternshipApplication[]>([]);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [institution, setInstitution] = useState("");
  const [course, setCourse] = useState("");
  const [student, setStudent] = useState(false);
  const [shelter, setShelter] = useState("cat");
  const [statement, setStatement] = useState("");
  const [supplement, setSupplement] = useState("");
  const post = useCallback(
    async (body: object) => {
      const response = await fetch("/api/internships", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          data.reason === "veterinary_student_required"
            ? "此申請只接受獸醫課程在學學生。"
            : data.reason === "intake_closed"
              ? "目前未開放新申請。"
              : (data.error ?? "申請狀態已變更，請重新載入後再試。"),
        );
      return data;
    },
    [token],
  );
  const refresh = async () => setApplications((await post({ action: "mine" })).applications);
  useEffect(() => {
    void fetch("/api/internships")
      .then((r) => r.json())
      .then(setIntake)
      .catch(() => setError("未能載入實習安排"));
  }, []);
  useEffect(() => {
    if (token)
      void post({ action: "mine" })
        .then((data) => setApplications(data.applications))
        .catch(() => setError("未能載入自己的申請"));
    else setApplications([]);
  }, [post, token]);
  const act = async (body: object) => {
    setBusy(true);
    setError("");
    try {
      await post({ ...body, idempotency_key: commandKey(body) });
      await refresh();
      setNotice("資料已保存。此申請不會佔用一般義工名額。");
    } catch (e) {
      setError(e instanceof Error ? e.message : "未能提交");
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="mx-auto max-w-3xl space-y-5 p-5">
      <h1 className="text-3xl font-bold">{intake?.settings.name ?? "獸醫學生實習申請"}</h1>
      <p>實習由職員獨立審核院校及課程證據，不按一般義工級別或出席次數批准。</p>
      <p className="whitespace-pre-wrap">{intake?.settings.instructions}</p>
      {!token ? (
        <VerifiedEmailSignIn />
      ) : (
        <>
          <h2 className="text-xl font-semibold">我的實習申請</h2>
          {applications.length === 0 && <p>尚未有申請紀錄。</p>}
          {applications.map((app) => (
            <article key={app.id} className="space-y-3 rounded border p-4">
              <h3>
                {app.contact_snapshot.name} · {internshipStatuses[app.status]}
              </h3>
              <p>
                {app.student_snapshot.institution} · {app.student_snapshot.course}
              </p>
              <ul>
                {app.events.map((event) => (
                  <li key={event.id}>
                    {event.detail.reason ??
                      event.detail.statement ??
                      (event.kind === "submitted" ? "申請已提交" : "資料已更新")}
                  </li>
                ))}
              </ul>
              {app.attachments.map((file) => (
                <button
                  type="button"
                  key={file.id}
                  className="mr-3 underline"
                  onClick={async () => {
                    const response = await fetch(`/api/internships/attachment?id=${file.id}`, {
                      headers: { authorization: `Bearer ${token}` },
                    });
                    const data = await response.json();
                    if (response.ok) window.open(data.url, "_blank", "noopener,noreferrer");
                    else setError("未能開啟附件");
                  }}
                >
                  {file.label}
                </button>
              ))}
              {["submitted", "needs_information"].includes(app.status) && (
                <label className="block">
                  補交在學證明（私人PDF／JPEG／PNG，最多10MB）
                  <input
                    type="file"
                    accept="application/pdf,image/jpeg,image/png"
                    disabled={busy}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setBusy(true);
                      setError("");
                      try {
                        const form = new FormData();
                        form.set("file", file);
                        form.set("application_id", app.id);
                        form.set("expected_revision", String(app.revision));
                        form.set(
                          "idempotency_key",
                          commandKey({
                            application: app.id,
                            revision: app.revision,
                            name: file.name,
                            size: file.size,
                            modified: file.lastModified,
                          }),
                        );
                        const response = await fetch("/api/internships/attachment", {
                          method: "POST",
                          headers: { authorization: `Bearer ${token}` },
                          body: form,
                        });
                        if (!response.ok) throw new Error("附件未能保存，請重新載入後再試。");
                        await refresh();
                      } catch (e) {
                        setError(e instanceof Error ? e.message : "上載失敗");
                      } finally {
                        setBusy(false);
                      }
                    }}
                  />
                </label>
              )}
              {app.status === "needs_information" && (
                <>
                  <label className="block">
                    補充資料
                    <textarea
                      className={field}
                      maxLength={3000}
                      value={supplement}
                      onChange={(e) => setSupplement(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !supplement.trim()}
                    className="rounded border px-4 py-2"
                    onClick={() =>
                      act({
                        action: "supplement",
                        application_id: app.id,
                        expected_revision: app.revision,
                        statement: supplement,
                      })
                    }
                  >
                    提交補充資料
                  </button>
                </>
              )}
              {app.status !== "withdrawn" && (
                <button
                  disabled={busy}
                  className="ml-3 rounded border px-4 py-2"
                  onClick={() =>
                    act({
                      action: "withdraw",
                      application_id: app.id,
                      expected_revision: app.revision,
                    })
                  }
                >
                  撤回申請
                </button>
              )}
            </article>
          ))}
          {!intake?.settings.enabled ? (
            <p>目前未開放新申請；已有申請仍可查看及按要求補交資料。</p>
          ) : applications.some((a) =>
              ["submitted", "needs_information", "approved"].includes(a.status),
            ) ? null : (
            <form
              className="space-y-3"
              onSubmit={(e) => {
                e.preventDefault();
                void act({
                  action: "submit",
                  intake_version_id: intake.version,
                  name,
                  phone,
                  institution,
                  course,
                  veterinary_student: student,
                  shelter,
                  statement,
                });
              }}
            >
              <h2 className="text-xl font-semibold">新增申請</h2>
              {[
                ["姓名", name, setName, 120],
                ["聯絡電話", phone, setPhone, 40],
                ["院校", institution, setInstitution, 200],
                ["獸醫課程", course, setCourse, 200],
              ].map(([label, value, setter, max]) => (
                <label key={String(label)} className="block">
                  {String(label)}
                  <input
                    className={field}
                    required={label !== "聯絡電話"}
                    maxLength={Number(max)}
                    value={String(value)}
                    onChange={(e) => (setter as (v: string) => void)(e.target.value)}
                  />
                </label>
              ))}
              <label className="block">
                申請服務場地
                <select
                  className={field}
                  value={shelter}
                  onChange={(e) => setShelter(e.target.value)}
                >
                  {intake.settings.shelters.map((key) => (
                    <option key={key} value={key}>
                      {key === "cat" ? "貓舍" : "狗舍"}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                補充說明
                <textarea
                  className={field}
                  maxLength={3000}
                  value={statement}
                  onChange={(e) => setStatement(e.target.value)}
                />
              </label>
              <label className="block">
                <input
                  type="checkbox"
                  checked={student}
                  onChange={(e) => setStudent(e.target.checked)}
                />{" "}
                本人現正修讀獸醫課程，並會提供在學證明供核實
              </label>
              <button className="rounded border px-4 py-2" disabled={busy}>
                提交獨立實習申請
              </button>
            </form>
          )}
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
