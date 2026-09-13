import { VolunteerLegacyReconciliation } from "./VolunteerLegacyReconciliation";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";

type Profile = {
  id: string;
  display_name: string;
  birth_date: string;
  joined_on: string | null;
  history_coverage_start: string | null;
  tier: "newcomer" | "regular" | "senior";
  status: string;
  revision: number;
};
type Credential = {
  id: string;
  profile_id: string;
  credential_key: string;
  valid_from: string;
  valid_until: string | null;
  revoked_at: string | null;
  evidence: string;
};
type Data = {
  profiles: Profile[];
  credentials: Credential[];
  credential_definitions: { key: string; label: string }[];
};
const post = <T,>(body: object) =>
  fetchAdminJson<T>("/api/admin/volunteers/qualifications", {
    method: "POST",
    body: JSON.stringify(body),
  });
const inputClass = "min-h-11 rounded border border-[var(--color-border)] p-2";
const tiers = { newcomer: "新手義工", regular: "恆常義工", senior: "資深義工" };
export function VolunteerQualifications() {
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["volunteer-qualifications"],
    queryFn: () => post<Data>({ action: "list" }),
  });
  const [selected, setSelected] = useState("");
  const [tier, setTier] = useState<Profile["tier"]>("newcomer");
  const [joined, setJoined] = useState("");
  const [coverage, setCoverage] = useState("");
  const [reason, setReason] = useState("");
  const [key, setKey] = useState("");
  const [from, setFrom] = useState("");
  const [until, setUntil] = useState("");
  const [evidence, setEvidence] = useState("");
  const profile = query.data?.profiles.find((p) => p.id === selected);
  const mutation = useMutation({
    mutationFn: (command: object) => post(command),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["volunteer-qualifications"] });
    },
  });
  const act = (command: object) => {
    if (profile && reason.trim())
      mutation.mutate({
        profile_id: profile.id,
        expected_revision: profile.revision,
        reason,
        ...command,
      });
  };
  return (
    <section className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">義工身份與資格核實</h1>
        <p>只按已核實證據設定級別及課程資格。自填 Remark 不會授予技能；既有出席及名單會保留。</p>
      </header>
      <nav className="flex gap-4">
        <a href="/admin/volunteers">返回名單</a>
        <a href="/admin/volunteers/calendar">義工月曆</a>
      </nav>
      <VolunteerLegacyReconciliation profiles={query.data?.profiles ?? []} />
      {query.isLoading && <p>載入中…</p>}
      {query.error && <p role="alert">未能載入身份資料</p>}
      <label className="flex flex-col gap-2">
        選擇義工
        <select
          className={inputClass}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            const p = query.data?.profiles.find((x) => x.id === e.target.value);
            if (p) {
              setTier(p.tier);
              setJoined(p.joined_on ?? "");
              setCoverage(p.history_coverage_start ?? "");
            }
          }}
        >
          <option value="">請選擇待核實或已有身份</option>
          {query.data?.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name} ·{" "}
              {p.status === "pending" ? "待核實" : p.status === "active" ? "已核實" : "暫停"} ·{" "}
              {tiers[p.tier]}
            </option>
          ))}
        </select>
      </label>
      {profile && (
        <div className="space-y-4 rounded-lg border p-5">
          <p>出生日期：{profile.birth_date || "未提供"}</p>
          <label className="flex flex-col gap-2">
            核實級別
            <select
              className={inputClass}
              value={tier}
              onChange={(e) => setTier(e.target.value as Profile["tier"])}
            >
              {Object.entries(tiers).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            核實／更正理由與證據來源
            <textarea
              className={inputClass}
              required
              maxLength={1000}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label>
              已核實加入日期（不詳留空）
              <input
                className={inputClass}
                type="date"
                value={joined}
                onChange={(e) => setJoined(e.target.value)}
              />
            </label>
            <label>
              完整出席紀錄覆蓋起日（不詳留空）
              <input
                className={inputClass}
                type="date"
                value={coverage}
                onChange={(e) => setCoverage(e.target.value)}
              />
            </label>
          </div>
          <p>只有已核實且完整覆蓋的月份才可判斷零出席。請在理由記錄日期及覆蓋範圍的證據來源。</p>
          <div className="flex gap-3">
            <button
              className={inputClass}
              disabled={!reason.trim() || mutation.isPending}
              onClick={() =>
                act({
                  action: "verify",
                  tier,
                  joined_on: joined || null,
                  history_coverage_start: coverage || null,
                })
              }
            >
              確認身份及級別
            </button>
            <button
              className={inputClass}
              disabled={!reason.trim() || mutation.isPending}
              onClick={() => act({ action: "suspend" })}
            >
              暫停新報名資格
            </button>
          </div>
          <h2 className="text-lg font-semibold">核實課程／技能</h2>
          <label className="flex flex-col gap-2">
            資格
            <select className={inputClass} value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">請選擇</option>
              {query.data?.credential_definitions.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              有效起日（香港時間）
              <input
                className={inputClass}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              到期日（該日零時失效；可留空）
              <input
                className={inputClass}
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-2">
            核實證據紀錄
            <textarea
              className={inputClass}
              maxLength={2000}
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
            />
          </label>
          <button
            className={inputClass}
            disabled={!key || !from || !evidence.trim() || !reason.trim() || mutation.isPending}
            onClick={() =>
              act({
                action: "credential",
                credential_key: key,
                valid_from: from + "T00:00:00+08:00",
                valid_until: until ? until + "T00:00:00+08:00" : null,
                evidence,
              })
            }
          >
            儲存已核實資格
          </button>
          <ul className="space-y-2">
            {query.data?.credentials
              .filter((c) => c.profile_id === profile.id)
              .map((c) => (
                <li key={c.id} className="rounded border p-3">
                  {
                    query.data?.credential_definitions.find((d) => d.key === c.credential_key)
                      ?.label
                  }{" "}
                  · {c.revoked_at ? "已撤銷" : "已核實"} ·{" "}
                  {c.valid_until
                    ? new Date(c.valid_until).toLocaleDateString("zh-HK", {
                        timeZone: "Asia/Hong_Kong",
                      })
                    : "未設到期日"}
                  <p>{c.evidence}</p>
                  {!c.revoked_at && (
                    <button
                      className={inputClass}
                      disabled={!reason.trim() || mutation.isPending}
                      onClick={() => act({ action: "revoke", credential_id: c.id })}
                    >
                      撤銷資格
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      {mutation.isSuccess && <p role="status">更新已保存，核實歷史及未來場次跟進任務已保留。</p>}
    </section>
  );
}
