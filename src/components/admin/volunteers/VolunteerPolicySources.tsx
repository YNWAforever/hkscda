import { WorkflowSections } from "./WorkflowSections";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { SourceListing } from "../../../lib/volunteers/policy/sourceService";
import { useAdminCopy } from "../i18n/copy";
import { policySourcesCopy } from "./policySourcesCopy";
import { LoadFailure } from "../LoadFailure";
const api = <T,>(body: unknown) =>
  fetchAdminJson<T>("/api/admin/volunteers/sources/", {
    method: "POST",
    body: JSON.stringify(body),
  });
const input = "min-h-11 min-w-0 w-full rounded border px-3 py-2";
type Preview = {
  preview_id: string;
  affected_templates: { template_key: string; name: string }[];
  effective_body: { name: string; capacity: { volunteers: { value?: number } } };
};
/** Where the form starts, for a test or a preview of the screen. In the browser it starts on venues. */
export type PolicySourcesInitial = { kind?: "shelter" | "credential" };
export function VolunteerPolicySources({ initial }: { initial?: PolicySourcesInitial } = {}) {
  const copy = useAdminCopy(policySourcesCopy);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["volunteer-policy-sources"],
    queryFn: () => api<SourceListing>({ action: "list" }),
  });
  const [kind, setKind] = useState<"shelter" | "credential">(initial?.kind ?? "shelter"),
    [key, setKey] = useState(""),
    [label, setLabel] = useState(""),
    [timezone, setTimezone] = useState("Asia/Hong_Kong"),
    [location, setLocation] = useState(""),
    [reason, setReason] = useState("");
  const [scope, setScope] = useState("common"),
    [template, setTemplate] = useState(""),
    [publicationReason, setPublicationReason] = useState("");
  const [newRegistryKey, setNewRegistryKey] = useState(() => crypto.randomUUID());
  const [publicationKey, setPublicationKey] = useState(() => crypto.randomUUID());
  const existing = (kind === "shelter" ? q.data?.shelters : q.data?.credentials)?.find(
    (r) => r.key === key,
  );
  const save = useMutation({
    mutationFn: () =>
      api({
        action: "registry_save",
        kind,
        key: key || `${kind}-${newRegistryKey}`,
        label,
        ...(kind === "shelter" ? { timezone, location } : {}),
        expected_revision: existing?.revision ?? 0,
        reason,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["volunteer-policy-sources"] });
      setKey("");
      setNewRegistryKey(crypto.randomUUID());
      setLabel("");
      setReason("");
    },
  });
  const preview = useMutation({
    mutationFn: () =>
      api<Preview>({
        action: "preview_source",
        scope_key: scope,
        template_key: template,
        draft_revision: q.data?.drafts.find((d) => d.template_key === template)?.revision,
        expected_revision: q.data?.sources.find((s) => s.scope_key === scope)?.revision ?? 0,
      }),
  });
  const publish = useMutation({
    mutationFn: () =>
      api({
        action: "publish_source",
        preview_id: preview.data?.preview_id,
        idempotency_key: publicationKey,
        reason: publicationReason,
      }),
    onSuccess: () => {
      preview.reset();
      setPublicationReason("");
      setPublicationKey(crypto.randomUUID());
      void qc.invalidateQueries({ queryKey: ["volunteer-policy-sources"] });
      void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
    },
  });
  return (
    <section className="space-y-6 p-4 md:p-6">
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <WorkflowSections
        sections={[
          { id: "source-registry", label: copy.sections.registry },
          { id: "source-publish", label: copy.sections.publish },
        ]}
      />
      <p>{copy.intro}</p>
      <a className="underline" href="/admin/volunteers/settings">
        {copy.back}
      </a>
      <section className="space-y-3 rounded border p-4">
        <h2 id="source-registry" className="text-lg font-bold">
          {copy.registry.title}
        </h2>
        <form
          className="grid gap-3 md:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <label className="grid min-w-0 gap-1">
            {copy.registry.kind}
            <select
              aria-label={copy.registry.kind}
              className={input}
              value={kind}
              onChange={(e) => {
                setKind(e.target.value as "shelter" | "credential");
                setKey("");
                setLabel("");
              }}
            >
              <option value="shelter">{copy.registry.kinds.shelter}</option>
              <option value="credential">{copy.registry.kinds.credential}</option>
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            {copy.registry.entry}
            <select
              aria-label={copy.registry.entry}
              className={input}
              value={key}
              onChange={(e) => {
                setKey(e.target.value);
                const row = (kind === "shelter" ? q.data?.shelters : q.data?.credentials)?.find(
                  (r) => r.key === e.target.value,
                );
                setLabel(row?.label ?? "");
                if (
                  row &&
                  "timezone" in row &&
                  typeof row.timezone === "string" &&
                  "location" in row &&
                  typeof row.location === "string"
                ) {
                  setTimezone(row.timezone);
                  setLocation(row.location);
                }
              }}
            >
              <option value="">{copy.registry.addNew}</option>
              {(kind === "shelter" ? q.data?.shelters : q.data?.credentials)?.map((r) => (
                <option key={r.key} value={r.key}>
                  {r.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            {copy.registry.label}
            <input
              required
              maxLength={150}
              className={input}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </label>
          {kind === "shelter" && (
            <>
              <label className="grid min-w-0 gap-1">
                {copy.registry.timezone}
                <input
                  required
                  className={input}
                  value={timezone}
                  onChange={(e) => setTimezone(e.target.value)}
                />
              </label>
              <label className="grid min-w-0 gap-1">
                {copy.registry.location}
                <input
                  required
                  maxLength={200}
                  className={input}
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </label>
            </>
          )}
          <label className="grid min-w-0 gap-1">
            {copy.registry.reason}
            <input
              required
              className={input}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <button disabled={save.isPending} className={input}>
            {copy.registry.save}
          </button>
        </form>
        {save.error && <p role="alert">{copy.registry.failed}</p>}
        {save.isSuccess && <p role="status">{copy.registry.saved}</p>}
      </section>
      <section className="space-y-3 rounded border p-4">
        <h2 id="source-publish" className="text-lg font-bold">
          {copy.publish.title}
        </h2>
        <p>{copy.publish.intro}</p>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="grid min-w-0 gap-1">
            {copy.publish.level}
            <select
              aria-label={copy.publish.level}
              className={input}
              value={scope}
              onChange={(e) => {
                setScope(e.target.value);
                preview.reset();
              }}
            >
              <option value="common">{copy.publish.shared}</option>
              {q.data?.shelters.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid min-w-0 gap-1">
            {copy.publish.draft}
            <select
              aria-label={copy.publish.draft}
              className={input}
              value={template}
              onChange={(e) => {
                setTemplate(e.target.value);
                preview.reset();
              }}
            >
              <option value="">{copy.publish.choose}</option>
              {q.data?.drafts.map((d) => (
                <option key={d.template_key} value={d.template_key}>
                  {copy.publish.draftOption(d.name, d.revision)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <button
          className={input}
          disabled={!template || preview.isPending}
          onClick={() => preview.mutate()}
        >
          {copy.publish.preview}
        </button>
        {preview.error && <p role="alert">{copy.publish.previewFailed}</p>}
        {preview.data && (
          <div className="space-y-3 rounded bg-[var(--color-surface-offset)] p-3">
            <p>
              {copy.publish.source(
                preview.data.effective_body.name,
                preview.data.effective_body.capacity.volunteers.value,
              )}
            </p>
            <p>
              {copy.publish.templates(
                preview.data.affected_templates.map((t) => t.name).join(copy.publish.nameSeparator),
              )}
            </p>
            <p>{copy.publish.note}</p>
            <label className="grid min-w-0 gap-1">
              {copy.publish.reason}
              <input
                className={input}
                required
                value={publicationReason}
                onChange={(e) => setPublicationReason(e.target.value)}
              />
            </label>
            <button
              className={input}
              disabled={!publicationReason.trim() || publish.isPending}
              onClick={() => publish.mutate()}
            >
              {copy.publish.confirm}
            </button>
          </div>
        )}
        {publish.error && <p role="alert">{copy.publish.failed}</p>}
        {publish.isSuccess && <p role="status">{copy.publish.published}</p>}
      </section>
      {q.error && (
        <LoadFailure error={q.error} onRetry={() => void q.refetch()} title={copy.loadFailed} />
      )}
    </section>
  );
}
