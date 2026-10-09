import { TablePager } from "../TablePager";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { adminIdentityQueryOptions } from "../../../lib/admin/pageAccess";
import { fetchAdminJson } from "../../../lib/admin/http";
import { adminErrorMessage } from "../../../lib/admin/session";
import { internshipErrorCode, intakeSchema } from "../../../lib/internships/service";
import type { InternshipApplication, IntakeBody } from "../../site/InternshipForm";
import { useAdminLanguage } from "../adminI18n";
import { useAdminCopy } from "../i18n/copy";
import { INTERNSHIP_STATUS_KEYS, internshipCopy } from "./copy";
const field = "block w-full rounded border border-[var(--color-border)] p-2";
const post = <T,>(body: object) =>
  fetchAdminJson<T>("/api/admin/internships", { method: "POST", body: JSON.stringify(body) });

/**
 * Why a screen shows an error. It is kept as a code (the key of the copy's `errors`), with the
 * caught error where the screen does not know how to write it in both languages, and written
 * when the screen renders.
 */
type ScreenError = { code: keyof typeof internshipCopy.zh.errors; cause?: unknown };

/** The error to keep for a failed action: a code the screens know, or the caught error. */
function failure(
  cause: unknown,
  fallback: "settings_failed" | "review_failed" | "attachment_failed",
): ScreenError {
  const code = internshipErrorCode(cause);
  return code ? { code } : { code: fallback, cause };
}

type IntakePreviewData = {
  preview_id: string;
  before: IntakeBody;
  after: IntakeBody;
  existing_applications_preserved: number;
};

/** The before-and-after of an intake change, with the reason and the publish button. */
export function IntakePublishPreview({
  preview,
  reason,
  busy,
  onReasonChange,
  onPublish,
}: {
  preview: IntakePreviewData;
  reason: string;
  busy: boolean;
  onReasonChange: (reason: string) => void;
  onPublish: () => void;
}) {
  const copy = useAdminCopy(internshipCopy);
  const settings = copy.settings;
  return (
    <div className="space-y-3 rounded border p-4">
      <h3>{settings.beforeAfter}</h3>
      <p>
        {preview.before.name} → {preview.after.name}
      </p>
      <p>
        {preview.before.enabled ? settings.open : settings.paused} →{" "}
        {preview.after.enabled ? settings.open : settings.paused}
      </p>
      <p>
        {settings.venuesLine(
          preview.after.shelters.map((s) => (s === "cat" ? copy.shelters.cat : copy.shelters.dog)),
        )}
      </p>
      <p>{settings.preserved(preview.existing_applications_preserved)}</p>
      <label>
        {settings.publishReason}
        <textarea
          className={field}
          value={reason}
          maxLength={1000}
          onChange={(e) => onReasonChange(e.target.value)}
        />
      </label>
      <button
        disabled={busy || !reason.trim()}
        className="rounded border px-4 py-2"
        onClick={onPublish}
      >
        {settings.publish}
      </button>
    </div>
  );
}

export function IntakeSettings() {
  const copy = useAdminCopy(internshipCopy);
  const { language } = useAdminLanguage();
  const settings = copy.settings;
  const [body, setBody] = useState<IntakeBody>();
  const [preview, setPreview] = useState<IntakePreviewData>();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<ScreenError | null>(null);
  const [notice, setNotice] = useState<keyof typeof copy.notices | null>(null);
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
    setError(null);
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
        setNotice("draft_saved");
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
        setNotice("published");
      }
    } catch (e) {
      setError(failure(e, "settings_failed"));
    } finally {
      setBusy(false);
    }
  };
  if (!value) return <p>{settings.loading}</p>;
  // A reason the caught error gave is shown as it came; otherwise the message for the code.
  const errorMessage = error
    ? (adminErrorMessage(error.cause, language) ?? copy.errors[error.code])
    : "";
  return (
    <details className="space-y-4 rounded border p-4">
      <summary className="cursor-pointer font-semibold">{settings.summary}</summary>
      <p>{settings.current(Boolean(q.data?.current.body.enabled))}</p>
      <label className="block">
        {settings.titleLabel}
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
        {settings.enabled}
      </label>
      <fieldset>
        <legend>{settings.venuesLegend}</legend>
        {(["cat", "dog"] as const).map((key) => (
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
            {copy.shelters[key]}
          </label>
        ))}
      </fieldset>
      {(["opens_at", "closes_at"] as const).map((key) => (
        <label className="block" key={key}>
          {key === "opens_at" ? settings.opensAt : settings.closesAt}
          {settings.timeHint}
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
        {settings.instructions}
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
          {settings.saveDraft}
        </button>
        <button
          disabled={busy || Boolean(body)}
          className="rounded border px-4 py-2"
          onClick={() => act("preview_intake")}
        >
          {settings.preview}
        </button>
      </div>
      {preview && (
        <IntakePublishPreview
          preview={preview}
          reason={reason}
          busy={busy}
          onReasonChange={setReason}
          onPublish={() => act("publish_intake")}
        />
      )}
      <h3>{settings.history}</h3>
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
            {settings.duplicate}
          </button>
        </p>
      ))}
      {errorMessage && <p role="alert">{errorMessage}</p>}
      {notice && <p role="status">{copy.notices[notice]}</p>}
    </details>
  );
}
export function InternshipManagement() {
  const copy = useAdminCopy(internshipCopy);
  const { language } = useAdminLanguage();
  const identity = useQuery(adminIdentityQueryOptions());
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const q = useQuery({
    queryKey: ["internships", "list", page, filterStatus, query],
    queryFn: () =>
      post<{
        applications: { id: string; name: string; institution: string; status: string }[];
        total: number;
      }>({
        action: "list",
        page,
        pageSize: 25,
        q: query,
        ...(filterStatus ? { status: filterStatus } : {}),
      }),
  });
  const [selected, setSelected] = useState("");
  const [status, setStatus] = useState("needs_information");
  const [reason, setReason] = useState("");
  const [verified, setVerified] = useState(false);
  const [evidence, setEvidence] = useState("");
  const [error, setError] = useState<ScreenError | null>(null);
  const [busy, setBusy] = useState(false);
  const detail = useQuery({
    queryKey: ["internships", "detail", selected],
    queryFn: () =>
      post<{ application: InternshipApplication }>({ action: "detail", application_id: selected }),
    enabled: Boolean(selected),
  });
  const app = detail.data?.application;
  const statusNames: Record<string, string> = copy.statuses;
  const statusName = (code: string) => statusNames[code] ?? code;
  // A reason the caught error gave is shown as it came; otherwise the message for the code.
  const errorMessage = error
    ? (adminErrorMessage(error.cause, language) ?? copy.errors[error.code])
    : "";
  return (
    <section className="space-y-5">
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      <p>{copy.intro}</p>
      {identity.data?.admin?.role === "admin" && <IntakeSettings />}
      <label className="block">
        {copy.searchLabel}
        <input
          className={field}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setPage(1);
          }}
        />
      </label>
      <label className="block">
        {copy.statusFilterLabel}
        <select
          className={field}
          value={filterStatus}
          onChange={(event) => {
            setFilterStatus(event.target.value);
            setPage(1);
          }}
        >
          <option value="">{copy.allStatuses}</option>
          {INTERNSHIP_STATUS_KEYS.map((key) => (
            <option key={key} value={key}>
              {copy.statuses[key]}
            </option>
          ))}
        </select>
      </label>
      <label className="block">
        {copy.applicantLabel}
        <select
          className={field}
          aria-label={copy.applicantLabel}
          value={selected}
          onChange={(e) => {
            setSelected(e.target.value);
            setVerified(false);
            setReason("");
            setEvidence("");
          }}
        >
          <option value="">{copy.chooseApplication}</option>
          {q.data?.applications.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {a.institution} · {statusName(a.status)}
            </option>
          ))}
        </select>
      </label>
      {q.data && (
        <TablePager
          page={page}
          pageSize={25}
          total={q.data.total}
          onPageChange={setPage}
          label={copy.pagerLabel}
        />
      )}
      {detail.error && (
        <p role="alert">
          {copy.detailFailed}
          <button onClick={() => void detail.refetch()}>{copy.retry}</button>
        </p>
      )}
      {q.isLoading && <p>{copy.loading}</p>}
      {q.error && <p role="alert">{copy.listFailed}</p>}
      {app && (
        <article className="space-y-4 rounded border p-4">
          <h2 className="font-semibold">
            {app.contact_snapshot.name} · {statusName(app.status)}
          </h2>
          <p>
            {app.contact_snapshot.email} · {app.contact_snapshot.phone}
          </p>
          <p>
            {app.student_snapshot.institution} · {app.student_snapshot.course} ·{" "}
            {app.shelter === "cat" ? copy.shelters.cat : copy.shelters.dog}
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
                      setError({ code: "attachment_failed" });
                    }
                  }}
                >
                  {f.label}
                </button>
              </li>
            ))}
          </ul>
          <h3>{copy.reviewHistory}</h3>
          {app.events.map((e) => (
            <p key={e.id}>
              {e.detail.reason ?? e.detail.statement ?? copy.recorded}
              {e.detail.evidence && ` · ${e.detail.evidence}`}
            </p>
          ))}
          {["submitted", "needs_information"].includes(app.status) && (
            <form
              className="space-y-3"
              onSubmit={async (e) => {
                e.preventDefault();
                setBusy(true);
                setError(null);
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
                  setError(failure(e, "review_failed"));
                } finally {
                  setBusy(false);
                }
              }}
            >
              <label>
                {copy.review.outcome}
                <select
                  className={field}
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                >
                  <option value="needs_information">{copy.review.needsInformation}</option>
                  <option value="approved">{copy.review.approve}</option>
                  <option value="rejected">{copy.review.reject}</option>
                </select>
              </label>
              <label className="block">
                {copy.review.reason}
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
                {copy.review.verified}
              </label>
              <label className="block">
                {copy.review.evidence}
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
                {copy.review.save}
              </button>
            </form>
          )}
        </article>
      )}
      {errorMessage && <p role="alert">{errorMessage}</p>}
    </section>
  );
}
