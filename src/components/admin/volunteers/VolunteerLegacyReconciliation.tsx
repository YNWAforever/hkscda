import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
type LegacyRow = {
  id: string;
  contact_name: string;
  contact_email: string;
  title: string;
  starts_at: string;
  status: string;
  updated_at: string;
  policy_bound: boolean;
};
const post = <T,>(body: object) =>
  fetchAdminJson<T>("/api/admin/volunteers/qualifications", {
    method: "POST",
    body: JSON.stringify(body),
  });
export function VolunteerLegacyReconciliation({
  profiles,
}: {
  profiles: { id: string; display_name: string; status: string }[];
}) {
  const cache = useQueryClient();
  const query = useQuery({
    queryKey: ["volunteer-legacy-identities"],
    queryFn: () => post<{ registrations: LegacyRow[] }>({ action: "list_legacy" }),
  });
  const [registrationId, setRegistrationId] = useState("");
  const [profileId, setProfileId] = useState("");
  const [reason, setReason] = useState("");
  const row = query.data?.registrations.find((r) => r.id === registrationId);
  const mutation = useMutation({
    mutationFn: () =>
      post<{ kind: string }>({
        action: "link_legacy",
        registration_id: row!.id,
        profile_id: profileId,
        expected_updated_at: row!.updated_at,
        reason,
      }),
    onSuccess: async () => {
      setRegistrationId("");
      await Promise.all([
        cache.invalidateQueries({ queryKey: ["volunteer-legacy-identities"] }),
        cache.invalidateQueries({ queryKey: ["volunteer-qualifications"] }),
      ]);
    },
  });
  const cls = "min-h-11 w-full rounded border p-2";
  return (
    <section className="space-y-4 rounded-lg border p-5">
      <h2 className="text-lg font-semibold">舊報名身份核對</h2>
      <p>
        只連結有證據的同一人，不會以相同姓名或電郵自動合併。原有姓名、備註、報名政策及條款紀錄會保留；連結不代表批准。團體與已完成紀錄不在此更改。
      </p>
      {query.error && <p role="alert">未能載入待核對名單</p>}
      <label className="block">
        待核對個人報名
        <select
          className={cls}
          value={registrationId}
          onChange={(e) => setRegistrationId(e.target.value)}
        >
          <option value="">請選擇</option>
          {query.data?.registrations.map((r) => (
            <option key={r.id} value={r.id}>
              {r.contact_name} · {r.title} ·{" "}
              {new Date(r.starts_at).toLocaleDateString("zh-HK", { timeZone: "Asia/Hong_Kong" })}
            </option>
          ))}
        </select>
      </label>
      {row && (
        <p>
          原報名聯絡：{row.contact_email}。
          {row.policy_bound
            ? "已有政策；連結後請義工登入並確認此場次最新條款，再由職員按政策審批。"
            : "尚未綁定政策；管理員須先在設定中心預覽並發佈套用於此場次的政策。"}
        </p>
      )}
      <label className="block">
        已核實義工
        <select className={cls} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          <option value="">請選擇已核實身份</option>
          {profiles
            .filter((p) => p.status === "active")
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.display_name}
              </option>
            ))}
        </select>
      </label>
      <label className="block">
        身份相符證據及核對理由
        <textarea
          className={cls}
          maxLength={1000}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
      </label>
      <button
        className="min-h-11 rounded bg-[var(--color-primary)] px-4 text-white disabled:opacity-50"
        disabled={!row || !profileId || !reason.trim() || mutation.isPending}
        onClick={() => mutation.mutate()}
      >
        記錄核對並連結身份
      </button>
      {mutation.error && <p role="alert">{mutation.error.message}</p>}
      {mutation.isSuccess && <p role="status">身份已連結；請完成政策及本人條款確認後審批。</p>}
    </section>
  );
}
