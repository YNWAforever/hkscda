import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { legacyReconciliationCopy } from "./legacyReconciliationCopy";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
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
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(legacyReconciliationCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
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
      <h2 className="text-lg font-semibold">{copy.title}</h2>
      <p>{copy.hint}</p>
      {query.error && (
        <div role="alert">
          <p>{copy.loadFailed}</p>
          <button
            type="button"
            className={cls}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            {copy.reload}
          </button>
        </div>
      )}
      {query.isLoading && <p role="status">{copy.loading}</p>}
      <label className="block">
        {copy.registration}
        <select
          className={cls}
          value={registrationId}
          onChange={(e) => setRegistrationId(e.target.value)}
        >
          <option value="">{copy.choose}</option>
          {query.data?.registrations.map((r) => (
            <option key={r.id} value={r.id}>
              {r.contact_name} · {r.title} · {format.legacyDate(r.starts_at)}
            </option>
          ))}
        </select>
      </label>
      {row && (
        <p>
          {copy.contact(row.contact_email)}
          {row.policy_bound ? copy.policyBound : copy.policyNotBound}
        </p>
      )}
      <label className="block">
        {copy.profile}
        <select className={cls} value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          <option value="">{copy.chooseProfile}</option>
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
        {copy.reason}
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
        {copy.submit}
      </button>
      {mutation.error && <p role="alert">{volunteerAdminErrorMessage(mutation.error, language)}</p>}
      {mutation.isSuccess && <p role="status">{copy.linked}</p>}
    </section>
  );
}
