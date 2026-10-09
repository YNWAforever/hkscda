import { WorkflowSections } from "./WorkflowSections";
import { useEffect, useState, type ReactNode } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getSupabaseClient } from "../../../lib/supabase";
import { fetchAdminJson } from "../../../lib/admin/http";
import type { AdminLanguage } from "../../../lib/admin/language";
import { volunteerAdminErrorMessage } from "../../../lib/volunteers/adminErrors";
import { TurnstileWidget, turnstileEnabled } from "../../site/TurnstileWidget";
import { VerifiedEmailSignIn, useCommandKey } from "../../site/volunteer/VerifiedEmailSignIn";
import type { OperationCommand } from "../../../lib/volunteers/policy/operations";
import { adminCommonCopy } from "../i18n/adminCommonCopy";
import { useAdminLanguageOrDefault } from "../i18n/languageContext";
import { pickAdminCopy } from "../i18n/copy";
import { sharedPageCopy } from "../pageCopy/sharedCopy";
import { OperationPreview } from "./OperationPreview";
import { volunteerFormatCopy } from "./volunteerFormatCopy";
import { volunteerOperationsCopy } from "./volunteerOperationsCopy";
import type {
  OperationGroup,
  OperationListing,
  OperationPreviewData,
} from "./volunteerOperationsTypes";

const input =
  "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2";
const button =
  "min-h-11 rounded-md border border-[var(--color-border)] px-4 py-2 font-semibold disabled:opacity-50";
function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      {children}
    </label>
  );
}

/**
 * What the notice under the heading says. The screen keeps a code, never a sentence, so a notice
 * shown in Chinese reads in English after the language is changed.
 */
type Notice = "previewReady" | "requested" | "applied";

/**
 * This screen is also the public page for volunteers, so `publicMode` always shows Chinese; the
 * admin shows the admin's language.
 */
function useOperationsLanguage(publicMode: boolean) {
  const adminLanguage = useAdminLanguageOrDefault();
  return publicMode ? "zh" : adminLanguage;
}

/** Who is signed in: not known yet, nobody, or a person. */
type SessionState =
  | { status: "checking" }
  | { status: "signedOut" }
  | { status: "signedIn"; userId: string };

/** What the page says to staff in place of the workspace while nobody is known to be signed in. */
function StaffSignInStatus({ checking, language }: { checking: boolean; language: AdminLanguage }) {
  const copy = pickAdminCopy(volunteerOperationsCopy, language);
  const notSignedIn = pickAdminCopy(sharedPageCopy, language).common.notSignedIn;
  const backToLogin = pickAdminCopy(adminCommonCopy, language).login.backToLogin;
  if (checking) return <p role="status">{copy.checkingSignIn}</p>;
  return (
    <>
      <p role="status">{notSignedIn}</p>
      <a href="/admin/login" className="inline-block min-h-11 py-2 underline">
        {backToLogin}
      </a>
    </>
  );
}

/**
 * The page shown until a person is signed in: the public page asks the volunteer to verify an email;
 * the admin page says it is checking, and once it knows nobody is signed in (also after signing out
 * on another tab) tells staff to sign in again.
 */
export function OperationsSignInGate({
  publicMode,
  checking,
}: {
  publicMode: boolean;
  checking: boolean;
}) {
  const language = useOperationsLanguage(publicMode);
  const copy = pickAdminCopy(volunteerOperationsCopy, language);
  return (
    <div className="space-y-4 p-4">
      <h1 className="text-2xl font-bold">{copy.title}</h1>
      {publicMode ? (
        <VerifiedEmailSignIn />
      ) : (
        <StaffSignInStatus checking={checking} language={language} />
      )}
    </div>
  );
}

const signedOut: SessionState = { status: "signedOut" };

function readSession(session: { user: { id: string } } | null): SessionState {
  return session ? { status: "signedIn", userId: session.user.id } : signedOut;
}

export function VolunteerOperations({ publicMode = false }: { publicMode?: boolean }) {
  const [session, setSession] = useState<SessionState>({ status: "checking" });
  useEffect(() => {
    const client = getSupabaseClient();
    void client.auth
      .getSession()
      .then(({ data }) => setSession(readSession(data.session)))
      .catch(() => setSession(signedOut));
    const { data } = client.auth.onAuthStateChange((_event, s) => setSession(readSession(s)));
    return () => data.subscription.unsubscribe();
  }, []);
  if (session.status !== "signedIn")
    return (
      <OperationsSignInGate publicMode={publicMode} checking={session.status === "checking"} />
    );
  return <OperationsWorkspace publicMode={publicMode} userId={session.userId} />;
}

/** The signed-in screen: the group requests, the rescheduling and the impact preview. */
export function OperationsWorkspace({
  publicMode = false,
  userId,
}: {
  publicMode?: boolean;
  userId: string;
}) {
  const language = useOperationsLanguage(publicMode);
  const copy = pickAdminCopy(volunteerOperationsCopy, language);
  const format = pickAdminCopy(volunteerFormatCopy, language);
  const qc = useQueryClient();
  const commandKey = useCommandKey();
  const [captcha, setCaptcha] = useState("");
  const [reset, setReset] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [destinationAccepted, setDestinationAccepted] = useState(false);
  const [preview, setPreview] = useState<OperationPreviewData>();
  const [reason, setReason] = useState("");
  const [enquiryId, setEnquiryId] = useState("");
  const [activityId, setActivityId] = useState("");
  const [requestCount, setRequestCount] = useState(1);
  const [requestId, setRequestId] = useState("");
  const [headcount, setHeadcount] = useState(1);
  const [operation, setOperation] = useState<"confirm" | "cancel">("confirm");
  const [lateAck, setLateAck] = useState(false);
  const [registrationId, setRegistrationId] = useState("");
  const [destinationId, setDestinationId] = useState("");
  const [role, setRole] = useState("volunteer");
  const endpoint = publicMode ? "/api/volunteer/operations" : "/api/admin/volunteers/operations";
  const api = <T,>(command: object) =>
    fetchAdminJson<T>(endpoint, {
      method: "POST",
      body: JSON.stringify(
        publicMode ? { command, turnstileToken: captcha || undefined } : command,
      ),
    });
  const listing = useQuery({
    queryKey: ["volunteer-operations", publicMode, userId],
    queryFn: () => api<OperationListing>({ action: "list" }),
  });
  const data = listing.data;
  const mutate = useMutation({
    mutationFn: (command: OperationCommand) =>
      api<{
        kind: string;
        terms_version_id?: string;
        destination_policy_version_id?: string;
        terms_body?: string;
        consent_required?: boolean;
        preview_id?: string;
        manifest?: OperationPreviewData["manifest"];
        late?: boolean;
        contact_snapshot?: OperationGroup["contact_snapshot"];
      }>(command),
    onSuccess: (result, command) => {
      if (result.kind === "preview" && result.preview_id) {
        setDestinationAccepted(false);
        setPreview({
          terms_version_id: result.terms_version_id,
          destination_policy_version_id: result.destination_policy_version_id,
          terms_body: result.terms_body,
          consent_required: result.consent_required,
          preview_id: result.preview_id,
          apply_action: command.action === "group_preview" ? "group_apply" : "move_apply",
          manifest: result.manifest ?? {},
          late: result.late,
          contact_snapshot: result.contact_snapshot,
        });
        setNotice("previewReady");
      } else {
        setPreview(undefined);
        setNotice(result.kind === "requested" ? "requested" : "applied");
        void qc.invalidateQueries({ queryKey: ["volunteer-operations"] });
        void qc.invalidateQueries({ queryKey: ["volunteer-calendar"] });
        void qc.invalidateQueries({ queryKey: ["volunteer-policy-settings"] });
      }
    },
    onError: () => setPreview(undefined),
    onSettled: () => {
      if (publicMode) {
        setCaptcha("");
        setReset((v) => v + 1);
      }
    },
  });
  useEffect(
    () => setPreview(undefined),
    [requestId, headcount, operation, lateAck, registrationId, destinationId, role],
  );
  const selectedRequest = data?.requests.find((r) => r.id === requestId);
  const registration = data?.registrations.find((r) => r.id === registrationId);
  const destination = data?.activities.find((a) => a.id === destinationId);
  const busy = mutate.isPending;
  const protectedReady = !publicMode || !turnstileEnabled || !!captcha;
  const failure = listing.error ?? mutate.error;
  const activityLabel = (id: string) => {
    const a = data?.activities.find((a) => a.id === id);
    return a ? `${a.title} · ${format.operationsTime(a.starts_at)}` : copy.records.originalSession;
  };
  return (
    <div className="space-y-6 p-4 md:p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-bold">{copy.title}</h1>
        <p>{copy.intro}</p>
        <a className="underline" href={publicMode ? "/volunteer" : "/admin/volunteers/calendar"}>
          {publicMode ? copy.backPublic : copy.backAdmin}
        </a>
      </header>
      <WorkflowSections
        label={copy.stepsLabel}
        sections={[
          { id: "operations-create", label: copy.steps.create },
          { id: "operations-records", label: copy.steps.records },
          { id: "operations-reschedule", label: copy.steps.reschedule },
        ]}
      />
      {listing.isLoading && <p>{copy.loading}</p>}
      {failure && (
        <p role="alert">
          {failure instanceof Error ? volunteerAdminErrorMessage(failure, language) : copy.notDone}
        </p>
      )}
      {notice && <p role="status">{copy.notices[notice]}</p>}
      {data && (
        <>
          <section className="space-y-4 rounded-lg border p-4">
            <h2 id="operations-create" className="text-lg font-bold">
              {copy.create.title}
            </h2>
            <p className="text-sm">{copy.create.note}</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={copy.create.enquiry}>
                <select
                  aria-label={copy.create.enquiry}
                  className={input}
                  value={enquiryId}
                  onChange={(e) => {
                    setEnquiryId(e.target.value);
                    setRequestCount(
                      data.enquiries.find((x) => x.id === e.target.value)?.participant_count ?? 1,
                    );
                  }}
                >
                  <option value="">{copy.create.choose}</option>
                  {data.enquiries.map((e) => (
                    <option key={e.id} value={e.id}>
                      {e.organisation} · {e.contact_name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={copy.create.session}>
                <select
                  aria-label={copy.create.session}
                  className={input}
                  value={activityId}
                  onChange={(e) => setActivityId(e.target.value)}
                >
                  <option value="">{copy.create.choose}</option>
                  {data.activities.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.title} · {format.operationsTime(a.starts_at)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={copy.create.size}>
                <input
                  className={input}
                  type="number"
                  min={1}
                  max={100000}
                  value={requestCount}
                  onChange={(e) => setRequestCount(Number(e.target.value))}
                />
              </Field>
            </div>
            <button
              className={button}
              disabled={!enquiryId || !activityId || requestCount < 1 || busy || !protectedReady}
              onClick={() => {
                const body = {
                  action: "request" as const,
                  activity_id: activityId,
                  enquiry_id: enquiryId,
                  headcount: requestCount,
                };
                mutate.mutate({ ...body, idempotency_key: commandKey(body) });
              }}
            >
              {copy.create.submit}
            </button>
            {data.enquiries.length === 0 && <p>{copy.create.noEnquiries}</p>}
          </section>
          <section className="space-y-3 rounded-lg border p-4">
            <h2 id="operations-records" className="text-lg font-bold">
              {copy.records.title}
            </h2>
            {data.requests.map((r) => (
              <p key={r.id}>
                {copy.records.line(
                  r.contact_snapshot.organisation,
                  r.headcount,
                  copy.records.statuses[r.status],
                  activityLabel(r.activity_id),
                )}
              </p>
            ))}
            {data.requests.length === 0 && <p>{copy.records.none}</p>}
          </section>
          {data.staff && !publicMode && (
            <section className="space-y-4 rounded-lg border p-4">
              <h2 className="text-lg font-bold">{copy.staff.title}</h2>
              <div className="grid gap-4 md:grid-cols-3">
                <Field label={copy.staff.request}>
                  <select
                    aria-label={copy.staff.request}
                    className={input}
                    value={requestId}
                    onChange={(e) => {
                      setRequestId(e.target.value);
                      setHeadcount(
                        data.requests.find((r) => r.id === e.target.value)?.headcount ?? 1,
                      );
                    }}
                  >
                    <option value="">{copy.create.choose}</option>
                    {data.requests
                      .filter((r) => r.status !== "cancelled")
                      .map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.contact_snapshot.organisation} · {activityLabel(r.activity_id)}
                        </option>
                      ))}
                  </select>
                </Field>
                <Field label={copy.staff.action}>
                  <select
                    aria-label={copy.staff.action}
                    className={input}
                    value={operation}
                    onChange={(e) =>
                      setOperation(e.target.value === "cancel" ? "cancel" : "confirm")
                    }
                  >
                    <option value="confirm">{copy.staff.confirm}</option>
                    <option value="cancel">{copy.staff.cancel}</option>
                  </select>
                </Field>
                <Field label={copy.staff.size}>
                  <input
                    className={input}
                    type="number"
                    min={1}
                    disabled={operation === "cancel"}
                    value={headcount}
                    onChange={(e) => setHeadcount(Number(e.target.value))}
                  />
                </Field>
              </div>
              <label className="flex min-h-11 items-center gap-2">
                <input
                  type="checkbox"
                  checked={lateAck}
                  onChange={(e) => setLateAck(e.target.checked)}
                />
                {copy.staff.lateAck}
              </label>
              <button
                className={button}
                disabled={!selectedRequest || busy}
                onClick={() =>
                  selectedRequest &&
                  mutate.mutate({
                    action: "group_preview",
                    request_id: selectedRequest.id,
                    expected_revision: selectedRequest.revision,
                    operation,
                    headcount: operation === "cancel" ? 0 : headcount,
                    acknowledge_late_change: lateAck,
                  })
                }
              >
                {copy.staff.preview}
              </button>
            </section>
          )}
          <section className="space-y-4 rounded-lg border p-4">
            <h2 id="operations-reschedule" className="text-lg font-bold">
              {copy.reschedule.title}
            </h2>
            <p className="text-sm">{copy.reschedule.note}</p>
            <div className="grid gap-4 md:grid-cols-3">
              <Field label={copy.reschedule.registration}>
                <select
                  aria-label={copy.reschedule.registration}
                  className={input}
                  value={registrationId}
                  onChange={(e) => setRegistrationId(e.target.value)}
                >
                  <option value="">{copy.create.choose}</option>
                  {data.registrations.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.contact_name} · {activityLabel(r.activity_id)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label={copy.reschedule.destination}>
                <select
                  aria-label={copy.reschedule.destination}
                  className={input}
                  value={destinationId}
                  onChange={(e) => {
                    setDestinationId(e.target.value);
                    setRole(
                      data.activities.find((a) => a.id === e.target.value)?.roles[0]?.key ??
                        "volunteer",
                    );
                  }}
                >
                  <option value="">{copy.create.choose}</option>
                  {data.activities
                    .filter((a) => a.id !== registration?.activity_id)
                    .map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.title} · {format.operationsTime(a.starts_at)}
                      </option>
                    ))}
                </select>
              </Field>
              <Field label={copy.reschedule.role}>
                <select
                  aria-label={copy.reschedule.role}
                  className={input}
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                >
                  {destination?.roles.map((r) => (
                    <option key={r.key} value={r.key}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <button
              className={button}
              disabled={!registration || !destination || busy || !protectedReady}
              onClick={() =>
                registration &&
                mutate.mutate({
                  action: "move_preview",
                  registration_id: registration.id,
                  expected_updated_at: registration.updated_at,
                  activity_id: destinationId,
                  role,
                })
              }
            >
              {copy.reschedule.preview}
            </button>
          </section>
          {preview && (
            <OperationPreview
              preview={preview}
              copy={copy.preview}
              publicMode={publicMode}
              destinationAccepted={destinationAccepted}
              onAccept={setDestinationAccepted}
              reason={reason}
              onReason={setReason}
              applyDisabled={Boolean(
                !reason.trim() ||
                busy ||
                !protectedReady ||
                (preview.apply_action === "move_apply" &&
                  (publicMode ? !destinationAccepted : preview.consent_required)),
              )}
              onApply={() => {
                const body = {
                  action: preview.apply_action,
                  preview_id: preview.preview_id,
                  reason,
                  ...(preview.apply_action === "move_apply"
                    ? {
                        destination_policy_version_id: preview.destination_policy_version_id,
                        terms_version_id: preview.terms_version_id,
                        ...(publicMode && destinationAccepted
                          ? { accept_terms: true as const }
                          : {}),
                      }
                    : {}),
                };
                mutate.mutate({ ...body, idempotency_key: commandKey(body) });
              }}
            />
          )}
        </>
      )}
      {publicMode && turnstileEnabled && (
        <TurnstileWidget resetKey={reset} onVerify={setCaptcha} onExpire={() => setCaptcha("")} />
      )}
    </div>
  );
}
