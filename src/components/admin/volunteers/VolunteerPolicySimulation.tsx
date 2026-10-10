import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { policySimulationCopy } from "./policySimulationCopy";
import { policyFormatCopy } from "./policyFormatCopy";
import { LoadFailure } from "../LoadFailure";
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
/** Where the form starts, for a test or a preview of the screen. In the browser it starts empty. */
export type PolicySimulationInitial = {
  template?: string;
  activity?: string;
  profile?: string;
  role?: string;
  time?: string;
};
const endpoint = "/api/admin/volunteers/simulation/";
const send = <T,>(body: unknown) =>
  fetchAdminJson<T>(endpoint, { method: "POST", body: JSON.stringify(body) });
const input = "min-h-11 min-w-0 w-full rounded border px-3 py-2";
export function VolunteerPolicySimulation({ initial }: { initial?: PolicySimulationInitial } = {}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(policySimulationCopy, language);
  const format = pickAdminCopy(policyFormatCopy, language);
  const listing = useQuery({
    queryKey: ["volunteer-policy-simulation"],
    queryFn: () => send<Listing>({ action: "list" }),
  });
  const [template, setTemplate] = useState(initial?.template ?? "");
  const [activity, setActivity] = useState(initial?.activity ?? "");
  const [profile, setProfile] = useState(initial?.profile ?? "");
  const [role, setRole] = useState(initial?.role ?? "volunteer");
  const [time, setTime] = useState(initial?.time ?? "");
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
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p>{copy.intro}</p>
      <a className="underline" href="/admin/volunteers/settings">
        {copy.back}
      </a>
      {listing.error && (
        <LoadFailure
          error={listing.error}
          onRetry={() => void listing.refetch()}
          title={copy.loadFailed}
        />
      )}
      <form
        className="grid gap-4 md:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          simulate.mutate();
        }}
      >
        <label className="grid min-w-0 gap-1">
          {copy.fields.draft}
          <select
            aria-label={copy.fields.draft}
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
            <option value="">{copy.choose}</option>
            {listing.data?.drafts.map((d) => (
              <option key={d.template_key} value={d.template_key}>
                {copy.draftOption(d.name, d.revision)}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          {copy.fields.session}
          <select
            aria-label={copy.fields.session}
            required
            className={input}
            value={activity}
            onChange={(e) => change(setActivity, e.target.value)}
          >
            <option value="">{copy.choose}</option>
            {listing.data?.activities.map((a) => (
              <option key={a.id} value={a.id}>
                {format.simulationDateTime(a.starts_at)} · {a.title}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          {copy.fields.volunteer}
          <select
            aria-label={copy.fields.volunteer}
            required
            className={input}
            value={profile}
            onChange={(e) => change(setProfile, e.target.value)}
          >
            <option value="">{copy.choose}</option>
            {listing.data?.profiles.map((p) => (
              <option key={p.id} value={p.id}>
                {copy.volunteerOption(p.name, copy.tier(p.tier))}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1">
          {copy.fields.role}
          <select
            aria-label={copy.fields.role}
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
          {copy.fields.time}
          <input
            required
            type="datetime-local"
            className={input}
            value={time}
            onChange={(e) => change(setTime, e.target.value)}
          />
        </label>
        <button
          className="min-h-11 rounded bg-[var(--color-panel)] px-4 py-2 text-[var(--color-text-inverse)] disabled:opacity-50"
          disabled={simulate.isPending || !draft}
        >
          {copy.run}
        </button>
      </form>
      {simulate.error && <p role="alert">{copy.failed}</p>}
      {simulate.data && (
        <section aria-live="polite" className="space-y-2 rounded border p-4">
          <h2 className="font-bold">{copy.result(simulate.data.evaluation.allowed)}</h2>
          <p>{copy.reason(simulate.data.evaluation.reason)}</p>
          <p>
            {copy.figures(
              simulate.data.evaluation.capacity,
              simulate.data.evaluation.confirmed,
              simulate.data.evaluation.remaining,
            )}
          </p>
          {simulate.data.evaluation.next_boundary && (
            <p>
              {copy.boundary}
              {format.simulationDateTime(simulate.data.evaluation.next_boundary)}
            </p>
          )}
          <p className="text-sm">{copy.note}</p>
        </section>
      )}
    </section>
  );
}
