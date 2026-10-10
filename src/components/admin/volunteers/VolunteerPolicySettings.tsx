import { useUnsavedVolunteerDraft } from "./useUnsavedVolunteerDraft";
import { WorkflowSections } from "./WorkflowSections";
import { PolicyChangeSummary } from "./PolicyChangeSummary";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { fetchAdminJson } from "../../../lib/admin/http";
import { initialPolicyCatalogue } from "../../../lib/volunteers/policy/catalogue";
import { PolicyAdvancedFields } from "./PolicyAdvancedFields";
import { PolicySourceFields } from "./PolicySourceFields";
import type { SourceListing } from "../../../lib/volunteers/policy/sourceService";
import {
  getPolicyReadiness,
  policyDraftSchema,
  type PolicyDraft,
} from "../../../lib/volunteers/policy/schemas";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { policyChangeCopy } from "./policyChangeCopy";
import { policyCommonCopy } from "./policyCommonCopy";
import { copyOfTemplate } from "./policyDefaults";
import {
  PolicyInputError,
  policyErrorMessage,
  policyNoticeText,
  type PolicyNotice,
} from "./policySettingsLogic";
import { policySettingsCopy } from "./policySettingsCopy";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { policyFormatCopy } from "./policyFormatCopy";
import { ConfirmActionDialog } from "../ConfirmActionDialog";
import { confirmActionCopy } from "../confirmActionCopy";
import { LoadFailure } from "../LoadFailure";
type D = { template_key: string; body: PolicyDraft; revision: number };
type V = { id: string; template_key: string; effective_from: string; reason: string };
type A = {
  id: string;
  title: string;
  starts_at: string;
  capacity: number;
  template_key: string | null;
  approved_participants: number;
  waitlisted_participants: number;
};
type L = {
  drafts: D[];
  versions: V[];
  activities: A[];
  activity_total?: number;
  activity_limit?: number;
};
export type PolicyPreview = {
  preview_id: string;
  candidate: PolicyDraft;
  previous: PolicyDraft | null;
  issues: ({ path?: string; message?: string } | string)[];
  manifest: (A & { conflicts: string[] })[];
};
/**
 * Where the screen starts, for a test or a preview of the screen. In the browser the screen starts
 * empty and fills itself from the saved draft, so nothing passes this.
 */
export type PolicySettingsInitial = {
  draft?: PolicyDraft;
  revision?: number;
  dirty?: boolean;
  preview?: PolicyPreview;
  notice?: PolicyNotice;
  activityIds?: string[];
};
const api = <T,>(x: object) =>
    fetchAdminJson<T>("/api/admin/volunteers/settings", {
      method: "POST",
      body: JSON.stringify(x),
    }),
  ic = "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-white px-3 py-2 text-sm",
  bc = "min-h-11 rounded-md px-4 text-sm font-semibold disabled:opacity-50",
  hk = (d: string) => d + "T00:00:00+08:00";
function F({ n, c }: { n: string; c: React.ReactNode }) {
  return (
    <label className="space-y-1">
      <b className="block text-sm">{n}</b>
      {c}
    </label>
  );
}
export function VolunteerPolicySettings({ initial }: { initial?: PolicySettingsInitial } = {}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(policySettingsCopy, language);
  const common = pickAdminCopy(policyCommonCopy, language);
  const venues = pickAdminCopy(volunteerCommonCopy, language);
  const format = pickAdminCopy(policyFormatCopy, language);
  const change = pickAdminCopy(policyChangeCopy, language);
  const registry = useQuery({
    queryKey: ["volunteer-policy-sources"],
    queryFn: () =>
      fetchAdminJson<SourceListing>("/api/admin/volunteers/sources/", {
        method: "POST",
        body: JSON.stringify({ action: "list" }),
      }),
  });
  const qc = useQueryClient(),
    q = useQuery({
      queryKey: ["volunteer-policy-settings"],
      queryFn: () => api<L>({ action: "list" }),
    });
  const [key, setKey] = useState(
      initial?.draft?.template_key ?? initialPolicyCatalogue[0].template_key,
    ),
    [draft, setDraft] = useState<PolicyDraft | undefined>(initial?.draft),
    [rev, setRev] = useState(initial?.revision ?? 0),
    [dirty, setDirty] = useState(initial?.dirty ?? false),
    [preview, setPreview] = useState<PolicyPreview | undefined>(initial?.preview),
    [from, setFrom] = useState(""),
    [until, setUntil] = useState(""),
    [reason, setReason] = useState(""),
    [date, setDate] = useState(""),
    [ids, setIds] = useState<string[]>(initial?.activityIds ?? []),
    [notice, setNotice] = useState<PolicyNotice | undefined>(initial?.notice);
  const row = q.data?.drafts.find((x) => x.template_key === key),
    base = initialPolicyCatalogue.find((x) => x.template_key === key);
  useEffect(() => {
    const x = row?.body ?? base;
    if (x) {
      setDraft(structuredClone(x));
      setRev(row?.revision ?? 0);
      setDirty(false);
      setPreview(undefined);
      setIds([]);
    }
  }, [row, base, key]);
  const leaveDialog = useUnsavedVolunteerDraft(dirty);
  const [switchKey, setSwitchKey] = useState<string | null>(null);
  const shared = pickAdminCopy(confirmActionCopy, language);
  const ready = useMemo(
    () => (draft ? getPolicyReadiness(draft, language) : null),
    [draft, language],
  );
  const edit = (f: (x: PolicyDraft) => void) => {
    if (!draft) return;
    const x = structuredClone(draft);
    f(x);
    setDraft(x);
    setDirty(true);
    setPreview(undefined);
  };
  const save = useMutation({
      mutationFn: () => {
        const p = policyDraftSchema.parse(draft);
        return api<{ draft: D }>({
          action: "save",
          template_key: key,
          expected_revision: rev,
          body: p,
        });
      },
      onSuccess: (r) => {
        setRev(r.draft.revision);
        setDraft(r.draft.body);
        setDirty(false);
        setNotice({ code: "draft_saved" });
        void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
      },
    }),
    pre = useMutation({
      mutationFn: () => {
        if (dirty || !rev || !from) throw new PolicyInputError("save_and_date");
        return api<PolicyPreview>({
          action: "preview",
          template_key: key,
          expected_revision: rev,
          effective_from: hk(from),
          effective_until: until ? hk(until) : null,
          activity_ids: ids,
        });
      },
      onSuccess: (x) => setPreview(x),
    }),
    pub = useMutation({
      mutationFn: () => {
        if (!preview || !reason.trim()) throw new PolicyInputError("preview_and_reason");
        return api<{ activity_ids: string[] }>({
          action: "publish",
          preview_id: preview.preview_id,
          idempotency_key: crypto.randomUUID(),
          reason,
        });
      },
      onSuccess: (x) => {
        setPreview(undefined);
        setNotice({ code: "published", count: x.activity_ids.length });
        void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
      },
    }),
    gen = useMutation({
      mutationFn: () =>
        api({ action: "generate", template_key: key, date, idempotency_key: crypto.randomUUID() }),
      onSuccess: () => setNotice({ code: "generated" }),
    }),
    cp = useMutation({
      mutationFn: (id: string) => api({ action: "copy", version_id: id, expected_revision: rev }),
      onSuccess: () => void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] }),
    });
  if (q.isError)
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} title={copy.loadFailed} />
      </div>
    );
  if (q.isLoading || !draft || !q.data)
    return (
      <div className="space-y-3 p-6">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p>{copy.loading}</p>
      </div>
    );
  const activities = q.data.activities.filter(
      (x) => x.template_key === key || x.template_key === null,
    ),
    versions = q.data.versions.filter((x) => x.template_key === key),
    err = save.error ?? pre.error ?? pub.error ?? gen.error ?? cp.error,
    // The templates a group situation can pair with, and the names English gives their keys: what
    // staff saved (they can rename it), with the catalogue where nothing is saved.
    savedTemplates = [
      ...new Map(
        [...initialPolicyCatalogue, ...q.data.drafts.map((x) => x.body)].map((x) => [
          x.template_key,
          x,
        ]),
      ).values(),
    ],
    lookups = {
      shelters: Object.fromEntries((registry.data?.shelters ?? []).map((s) => [s.key, s.label])),
      credentials: Object.fromEntries(
        (registry.data?.credentials ?? []).map((c) => [c.key, c.label]),
      ),
      templates: Object.fromEntries(
        [...savedTemplates, draft].map((x) => [x.template_key, x.name]),
      ),
    };
  return (
    <div className="space-y-6 p-4 md:p-6">
      {leaveDialog}
      <ConfirmActionDialog
        open={switchKey !== null}
        onOpenChange={(open) => {
          if (!open) setSwitchKey(null);
        }}
        title={shared.discardChanges}
        consequence={copy.confirmSwitch}
        confirmLabel={shared.discardChanges}
        destructive
        reason="none"
        onConfirm={async () => {
          if (switchKey !== null) setKey(switchKey);
        }}
      />
      <header>
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <a className="inline-block min-h-11 py-2 underline" href="/admin/volunteers/sources">
          {copy.links.sources}
        </a>
        <button
          className={bc}
          onClick={() => {
            const next = copyOfTemplate(draft, `template-${crypto.randomUUID()}`);
            setKey(next.template_key);
            setDraft(next);
            setRev(0);
            setDirty(true);
            setPreview(undefined);
            setIds([]);
          }}
        >
          {copy.createTemplate}
        </button>
        <a className="inline-block min-h-11 py-2 underline" href="/admin/volunteers/simulation">
          {copy.links.simulation}
        </a>
        <a className="inline-block min-h-11 py-2 underline" href="/admin/volunteers/daily-settings">
          {copy.links.daily}
        </a>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.intro(rev, dirty)}</p>
      </header>
      <WorkflowSections
        sections={[
          { id: "policy-basic", label: copy.sections.basic },
          { id: "policy-rules", label: copy.sections.rules },
          { id: "policy-source", label: copy.sections.source },
          { id: "policy-publish", label: copy.sections.publish },
        ]}
      />
      <section
        id="policy-basic"
        className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-3"
      >
        <F
          n={copy.fields.template}
          c={
            <select
              aria-label={copy.fields.template}
              className={ic}
              value={key}
              onChange={(e) => {
                if (dirty) setSwitchKey(e.target.value);
                else setKey(e.target.value);
              }}
            >
              {[
                ...new Map(
                  [...initialPolicyCatalogue, ...q.data.drafts.map((x) => x.body), draft].map(
                    (x) => [x.template_key, x],
                  ),
                ).values(),
              ].map((x) => (
                <option key={x.template_key} value={x.template_key}>
                  {x.name}
                </option>
              ))}
            </select>
          }
        />
        <F
          n={copy.fields.name}
          c={
            <input
              className={ic}
              value={draft.name}
              onChange={(e) =>
                edit((x) => {
                  x.name = e.target.value;
                })
              }
            />
          }
        />
        <F
          n={copy.fields.venue}
          c={
            <select
              className={ic}
              aria-label={copy.fields.venue}
              value={draft.shelter}
              onChange={(e) =>
                edit((x) => {
                  x.shelter = e.target.value;
                  const site = registry.data?.shelters.find((s) => s.key === e.target.value);
                  if (site) {
                    x.timezone = site.timezone;
                    x.schedule.location = site.location;
                  }
                })
              }
            >
              {(
                registry.data?.shelters ?? [
                  { key: "cat", label: venues.shelterName("cat") },
                  { key: "dog", label: venues.shelterName("dog") },
                  { key: "adoption", label: venues.shelterName("adoption") },
                ]
              ).map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          }
        />
        <F
          n={copy.fields.startTime}
          c={
            <input
              type="time"
              className={ic}
              value={typeof draft.schedule.start_time === "string" ? draft.schedule.start_time : ""}
              onChange={(e) =>
                edit((x) => {
                  x.schedule.start_time = e.target.value;
                })
              }
            />
          }
        />
        <F
          n={copy.fields.endTime}
          c={
            <input
              type="time"
              className={ic}
              value={typeof draft.schedule.end_time === "string" ? draft.schedule.end_time : ""}
              onChange={(e) =>
                edit((x) => {
                  x.schedule.end_time = e.target.value;
                })
              }
            />
          }
        />
        <F
          n={copy.fields.location}
          c={
            <input
              className={ic}
              value={typeof draft.schedule.location === "string" ? draft.schedule.location : ""}
              onChange={(e) =>
                edit((x) => {
                  x.schedule.location = e.target.value;
                })
              }
            />
          }
        />
        <F
          n={copy.fields.places}
          c={
            <input
              type="number"
              min={1}
              className={ic}
              value={
                draft.capacity.volunteers.state === "value" ? draft.capacity.volunteers.value : ""
              }
              onChange={(e) =>
                edit((x) => {
                  x.capacity.volunteers = { state: "value", value: Number(e.target.value) };
                })
              }
            />
          }
        />
        <F
          n={copy.fields.minimumAge}
          c={
            <input
              type="number"
              min={0}
              className={ic}
              value={typeof draft.eligibility.min_age === "number" ? draft.eligibility.min_age : ""}
              onChange={(e) =>
                edit((x) => {
                  x.eligibility.min_age = Number(e.target.value);
                })
              }
            />
          }
        />
        <F
          n={copy.fields.noteTitle}
          c={
            <input
              className={ic}
              value={draft.remarks.label}
              onChange={(e) =>
                edit((x) => {
                  x.remarks.label = e.target.value;
                })
              }
            />
          }
        />
        <F
          n={copy.fields.noteHint}
          c={
            <textarea
              className={ic}
              value={draft.remarks.hint}
              onChange={(e) =>
                edit((x) => {
                  x.remarks.hint = e.target.value;
                })
              }
            />
          }
        />
        <F
          n={copy.fields.credentials}
          c={
            <textarea
              className={ic}
              value={draft.eligibility.credentials.keys.join("\n")}
              onChange={(e) =>
                edit((x) => {
                  x.eligibility.credentials.keys = e.target.value
                    .split(/\r?\n/)
                    .map((v) => v.trim())
                    .filter(Boolean);
                })
              }
            />
          }
        />
        <fieldset>
          <legend className="text-sm font-bold">{copy.fields.tiers}</legend>
          {(["newcomer", "regular", "senior"] as const).map((t) => (
            <label key={t} className="mr-3 text-sm">
              <input
                type="checkbox"
                checked={draft.eligibility.allowed_tiers.includes(t)}
                onChange={(e) =>
                  edit((x) => {
                    x.eligibility.allowed_tiers = e.target.checked
                      ? [...x.eligibility.allowed_tiers, t]
                      : x.eligibility.allowed_tiers.filter((v) => v !== t);
                  })
                }
              />{" "}
              {common.tiers[t]}
            </label>
          ))}
        </fieldset>
        <p className="text-xs text-[var(--color-text-muted)] md:col-span-3">
          {copy.advancedSummary(
            draft.roles.length,
            draft.tier_quotas.length,
            draft.daily_limits.length,
            draft.release_rules.length,
          )}
        </p>
      </section>
      <div id="policy-rules">
        <PolicyAdvancedFields policy={draft} onChange={edit} templates={savedTemplates} />
      </div>
      <div id="policy-source">
        <PolicySourceFields policy={draft} onChange={edit} />
      </div>
      <section className="space-y-2 rounded-lg border bg-white p-4">
        <h2 className="text-lg font-bold">{copy.assessment.title}</h2>
        <p className="text-sm text-[var(--color-text-muted)]">{copy.assessment.text}</p>
        <a
          className="inline-block min-h-11 py-2 font-semibold text-[var(--color-primary)] underline"
          href="/admin/volunteers/assessments"
        >
          {copy.assessment.link}
        </a>
      </section>
      <section className="rounded-lg border bg-white p-4">
        <h2 className="font-bold">{copy.readiness.title}</h2>
        {ready?.ready ? (
          <p className="text-sm text-[var(--color-success)]">{copy.readiness.none}</p>
        ) : (
          <ul className="list-disc pl-5 text-sm text-[var(--color-warning)]">
            {ready?.issues.map((x, i) => (
              <li key={`${i}:${x.path}`}>
                <b>{change.issuePath(x.path)}</b>
                {copy.separator}
                {x.message}
              </li>
            ))}
          </ul>
        )}
      </section>
      <button
        className={bc + " bg-[var(--color-primary)] text-white"}
        disabled={!dirty || save.isPending}
        onClick={() => save.mutate()}
      >
        {copy.save}
      </button>
      <section className="space-y-4 rounded-lg border bg-white p-4">
        <h2 id="policy-publish" className="text-lg font-bold">
          {copy.publish.title}
        </h2>
        <div className="grid gap-3 md:grid-cols-3">
          <F
            n={copy.publish.effectiveDate}
            c={
              <input
                type="date"
                className={ic}
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setPreview(undefined);
                }}
              />
            }
          />
          <F
            n={copy.publish.endDate}
            c={
              <input
                type="date"
                className={ic}
                value={until}
                onChange={(e) => {
                  setUntil(e.target.value);
                  setPreview(undefined);
                }}
              />
            }
          />
          <F
            n={copy.publish.reason}
            c={<input className={ic} value={reason} onChange={(e) => setReason(e.target.value)} />}
          />
        </div>
        <fieldset>
          <legend className="text-sm font-bold">{copy.publish.affected}</legend>
          {activities.map((a) => (
            <label key={a.id} className="block rounded border p-2 text-sm">
              <input
                type="checkbox"
                checked={ids.includes(a.id)}
                onChange={(e) => {
                  setIds((v) => (e.target.checked ? [...v, a.id] : v.filter((id) => id !== a.id)));
                  setPreview(undefined);
                }}
              />{" "}
              {copy.publish.activityLine({
                title: a.title,
                capacity: a.capacity,
                approved: a.approved_participants,
                waitlisted: a.waitlisted_participants,
              })}
            </label>
          ))}
        </fieldset>
        <div className="flex gap-2">
          <button
            className={bc + " border"}
            disabled={
              dirty ||
              !rev ||
              !from ||
              (Boolean(until) && until <= from) ||
              pre.isPending ||
              pub.isPending
            }
            onClick={() => pre.mutate()}
          >
            {copy.publish.preview}
          </button>
          <button
            className={bc + " bg-[var(--color-primary)] text-white"}
            disabled={
              !preview ||
              preview.issues.length > 0 ||
              !reason.trim() ||
              pub.isPending ||
              pre.isPending ||
              dirty
            }
            onClick={() => pub.mutate()}
          >
            {copy.publish.publish}
          </button>
        </div>
        {preview ? (
          <div className="rounded bg-[var(--color-surface-offset)] p-3 text-sm">
            <b>{copy.publish.previewTitle(preview.previous?.name, preview.candidate.name)}</b>
            {preview.issues.length > 0 && (
              <div role="alert">
                {preview.issues.map((x, i) => (
                  <p key={i} className="text-[var(--color-error)]">
                    {copy.publish.issueLine(x)}
                  </p>
                ))}
              </div>
            )}
            <PolicyChangeSummary
              before={preview.previous}
              after={preview.candidate}
              lookups={lookups}
            />
            {preview.manifest.map((x) => (
              <p key={x.id}>
                {copy.publish.manifestLine(
                  x.title,
                  x.capacity,
                  x.conflicts.map(copy.publish.conflictName).join(copy.publish.conflictSeparator),
                )}
              </p>
            ))}
          </div>
        ) : null}
      </section>
      {(q.data?.activity_total ?? 0) > (q.data?.activity_limit ?? 500) && (
        <p role="status" className="text-sm">
          {copy.limited.before(q.data?.activity_limit)}
          <a href="/admin/volunteers/activities" className="underline">
            {copy.limited.link}
          </a>
          {copy.limited.after}
        </p>
      )}
      <section className="grid gap-4 rounded-lg border bg-white p-4 md:grid-cols-2">
        <div>
          <h2 className="font-bold">{copy.duplicate.title}</h2>
          {versions.map((v) => (
            <button key={v.id} className={bc + " mr-2 border"} onClick={() => cp.mutate(v.id)}>
              {copy.duplicate.button(format.policyVersionDate(v.effective_from))}
            </button>
          ))}
        </div>
        <div>
          <h2 className="font-bold">{copy.generate.title}</h2>
          <input
            type="date"
            className={ic}
            aria-label={copy.generate.dateLabel}
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
          <button
            className={bc + " mt-2 border"}
            disabled={!date || gen.isPending}
            onClick={() => gen.mutate()}
          >
            {copy.generate.button}
          </button>
        </div>
      </section>
      {dirty ? (
        <p role="status" className="text-sm text-[var(--color-warning)]">
          {copy.unsaved}
        </p>
      ) : null}
      {notice ? <p role="status">{policyNoticeText(notice, language)}</p> : null}
      {err ? (
        <p role="alert" className="whitespace-pre-line text-[var(--color-error)]">
          {policyErrorMessage(err, language)}
        </p>
      ) : null}
    </div>
  );
}
