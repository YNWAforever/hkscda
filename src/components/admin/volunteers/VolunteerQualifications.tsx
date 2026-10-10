import { VolunteerLegacyReconciliation } from "./VolunteerLegacyReconciliation";
import { useEffect, useState } from "react";
import { QualificationProfileSearch } from "./QualificationProfileSearch";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { legacyReconciliationCopy } from "./legacyReconciliationCopy";
import { qualificationsCopy } from "./qualificationsCopy";
import { volunteerDirectoryCopy } from "./volunteerDirectoryCopy";
import { policyFormatCopy } from "./policyFormatCopy";
import { LoadFailure } from "../LoadFailure";

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
const tierKeys = ["newcomer", "regular", "senior"] as const;
/** Which profile the screen starts on, for a test or a preview. In the browser it is the `profile_id` of the address. */
export type QualificationsInitial = { profileId?: string };
export function VolunteerQualifications({ initial }: { initial?: QualificationsInitial } = {}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(qualificationsCopy, language);
  const tiers = pickAdminCopy(volunteerDirectoryCopy, language).tiers;
  const format = pickAdminCopy(policyFormatCopy, language);
  const queryClient = useQueryClient();
  const [legacyOpened, setLegacyOpened] = useState(false);
  const query = useQuery({
    queryKey: ["volunteer-qualifications"],
    queryFn: () => post<Data>({ action: "list" }),
  });
  const [selected, setSelected] = useState(() => {
    if (initial?.profileId !== undefined) return initial.profileId;
    return typeof window === "undefined"
      ? ""
      : (new URLSearchParams(window.location.search).get("profile_id") ?? "");
  });
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["volunteer-qualifications"] }),
        queryClient.invalidateQueries({ queryKey: ["volunteer-directory"] }),
        queryClient.invalidateQueries({ queryKey: ["volunteer-person"] }),
        queryClient.invalidateQueries({ queryKey: ["volunteer-overview"] }),
      ]);
    },
  });
  const profileTier = profile?.tier;
  const profileJoined = profile?.joined_on;
  const profileCoverage = profile?.history_coverage_start;
  useEffect(() => {
    if (!profileTier) return;
    setTier(profileTier);
    setJoined(profileJoined ?? "");
    setCoverage(profileCoverage ?? "");
  }, [selected, profileTier, profileJoined, profileCoverage]);
  const selectProfile = (id: string) => {
    if (mutation.isPending) return;
    setSelected(id);
    setReason("");
    setKey("");
    setFrom("");
    setUntil("");
    setEvidence("");
    mutation.reset();
    const url = new URL(window.location.href);
    url.searchParams.set("profile_id", id);
    window.history.replaceState(null, "", url);
  };
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
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p>{copy.intro}</p>
      </header>
      <nav className="flex gap-4">
        <a href="/admin/volunteers/people">{copy.links.directory}</a>
        <a href="/admin/volunteers/calendar">{copy.links.calendar}</a>
      </nav>
      <QualificationProfileSearch onSelect={selectProfile} disabled={mutation.isPending} />
      {query.isLoading && <p>{copy.loading}</p>}
      {query.error && (
        <LoadFailure
          error={query.error}
          onRetry={() => void query.refetch()}
          title={copy.loadFailed}
          retryLabel={copy.reload}
        />
      )}
      <label className="flex flex-col gap-2">
        {copy.choose}
        <select
          className={inputClass}
          value={selected}
          aria-label={copy.choose}
          disabled={mutation.isPending}
          onChange={(e) => selectProfile(e.target.value)}
        >
          <option value="">{copy.chooseOption}</option>
          {query.data?.profiles.map((p) => (
            <option key={p.id} value={p.id}>
              {copy.option(p.display_name, copy.status(p.status), tiers[p.tier])}
            </option>
          ))}
        </select>
      </label>
      {profile && (
        <div className="space-y-4 rounded-lg border p-5">
          <h2 className="text-lg font-bold">{copy.profile.heading(profile.display_name)}</h2>
          <a
            className="inline-block min-h-11 py-2 underline"
            href={`/admin/volunteers/people/${profile.id}`}
          >
            {copy.profile.record}
          </a>
          <p>
            {copy.profile.birthDate(
              profile.birth_date ? format.day(profile.birth_date) : copy.profile.notProvided,
            )}
          </p>
          <label className="flex flex-col gap-2">
            {copy.profile.tier}
            <select
              className={inputClass}
              value={tier}
              onChange={(e) => setTier(e.target.value as Profile["tier"])}
            >
              {tierKeys.map((k) => (
                <option key={k} value={k}>
                  {tiers[k]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            {copy.profile.reason}
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
              {copy.profile.joinedOn}
              <input
                className={inputClass}
                type="date"
                value={joined}
                onChange={(e) => setJoined(e.target.value)}
              />
            </label>
            <label>
              {copy.profile.coverageStart}
              <input
                className={inputClass}
                type="date"
                value={coverage}
                onChange={(e) => setCoverage(e.target.value)}
              />
            </label>
          </div>
          <p>{copy.profile.coverageNote}</p>
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
              {copy.profile.verify}
            </button>
            <button
              className={inputClass}
              disabled={!reason.trim() || mutation.isPending}
              onClick={() => act({ action: "suspend" })}
            >
              {copy.profile.pause}
            </button>
          </div>
          <h2 className="text-lg font-semibold">{copy.credential.title}</h2>
          <label className="flex flex-col gap-2">
            {copy.credential.label}
            <select className={inputClass} value={key} onChange={(e) => setKey(e.target.value)}>
              <option value="">{copy.credential.choose}</option>
              {query.data?.credential_definitions.map((d) => (
                <option key={d.key} value={d.key}>
                  {d.label}
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-2">
              {copy.credential.validFrom}
              <input
                className={inputClass}
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-2">
              {copy.credential.expiry}
              <input
                className={inputClass}
                type="date"
                value={until}
                onChange={(e) => setUntil(e.target.value)}
              />
            </label>
          </div>
          <label className="flex flex-col gap-2">
            {copy.credential.evidence}
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
            {copy.credential.save}
          </button>
          <ul className="space-y-2">
            {query.data?.credentials
              .filter((c) => c.profile_id === profile.id)
              .map((c) => (
                <li key={c.id} className="rounded border p-3">
                  {copy.credential.line(
                    copy.credential.name(
                      query.data?.credential_definitions.find((d) => d.key === c.credential_key)
                        ?.label,
                    ),
                    c.revoked_at ? copy.credential.revoked : copy.credential.verified,
                    c.valid_until
                      ? format.credentialExpiry(c.valid_until)
                      : copy.credential.noExpiry,
                  )}
                  <p>{c.evidence}</p>
                  {!c.revoked_at && (
                    <button
                      className={inputClass}
                      disabled={!reason.trim() || mutation.isPending}
                      onClick={() => act({ action: "revoke", credential_id: c.id })}
                    >
                      {copy.credential.revoke}
                    </button>
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
      <details
        className="rounded-lg border p-4"
        onToggle={(event) => {
          if (event.currentTarget.open) setLegacyOpened(true);
        }}
      >
        <summary className="cursor-pointer font-semibold">
          {pickAdminCopy(legacyReconciliationCopy, language).title}
        </summary>
        {legacyOpened && <VolunteerLegacyReconciliation profiles={query.data?.profiles ?? []} />}
      </details>
      {mutation.error && <p role="alert">{volunteerAdminErrorMessage(mutation.error, language)}</p>}
      {mutation.isSuccess && <p role="status">{copy.saved}</p>}
    </section>
  );
}
