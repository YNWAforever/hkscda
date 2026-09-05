import { useState, type FormEvent } from "react";

import { TurnstileWidget, turnstileEnabled } from "../TurnstileWidget";
import type { GroupEnquiryActivityType } from "../../../lib/groupEnquiries/types";

export const ACTIVITY_LABELS = {
  group_workshop: "團體義工工作坊",
  school_talk: "入校講座",
  shelter_visit: "貓狗舍教育參觀活動",
  other: "其他活動查詢",
} as const satisfies Record<GroupEnquiryActivityType, string>;

export type GroupEnquiryFormState = {
  organisationName: string;
  contactPerson: string;
  email: string;
  phone: string;
  activityType: GroupEnquiryActivityType;
  otherActivityDescription?: string;
  participantCount?: string;
  participantAgeProfile?: string;
  preferredDateNotes?: string;
  message?: string;
  idempotencyKey: string;
  turnstileToken?: string | null;
};

function clean(value: string | undefined) {
  const next = value?.trim();
  return next ? next : undefined;
}

export function shouldShowOtherActivityDescription(activityType: GroupEnquiryActivityType) {
  return activityType === "other";
}

export function buildGroupEnquiryPayload(state: GroupEnquiryFormState) {
  return {
    organisationName: state.organisationName.trim(),
    contactPerson: state.contactPerson.trim(),
    email: state.email.trim().toLowerCase(),
    phone: state.phone.trim(),
    activityType: state.activityType,
    otherActivityDescription: shouldShowOtherActivityDescription(state.activityType)
      ? clean(state.otherActivityDescription)
      : undefined,
    participantCount: clean(state.participantCount) ? Number(state.participantCount) : undefined,
    participantAgeProfile: clean(state.participantAgeProfile),
    preferredDateNotes: clean(state.preferredDateNotes),
    message: clean(state.message),
    idempotencyKey: state.idempotencyKey,
    turnstileToken: state.turnstileToken ?? undefined,
  };
}

function newIdempotencyKey() {
  return crypto.randomUUID();
}

export function GroupEnquiryForm() {
  const [organisationName, setOrganisationName] = useState("");
  const [contactPerson, setContactPerson] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [activityType, setActivityType] = useState<GroupEnquiryActivityType>("group_workshop");
  const [otherActivityDescription, setOtherActivityDescription] = useState("");
  const [participantCount, setParticipantCount] = useState("");
  const [participantAgeProfile, setParticipantAgeProfile] = useState("");
  const [preferredDateNotes, setPreferredDateNotes] = useState("");
  const [message, setMessage] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => newIdempotencyKey());
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const canSubmit = !submitting && (!turnstileEnabled || Boolean(turnstileToken));

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setSubmitError(null);
    setTurnstileToken(null);
    setSuccess(false);
    try {
      const response = await fetch("/api/volunteer/group-enquiries", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(
          buildGroupEnquiryPayload({
            organisationName,
            contactPerson,
            email,
            phone,
            activityType,
            otherActivityDescription,
            participantCount,
            participantAgeProfile,
            preferredDateNotes,
            message,
            idempotencyKey,
            turnstileToken,
          }),
        ),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "查詢未能送出，請稍後再試。");
      setSuccess(true);
      setIdempotencyKey(newIdempotencyKey());
      setTurnstileToken(null);
    } catch (error) {
      if (turnstileEnabled) setTurnstileResetKey((key) => key + 1);
      setSubmitError(error instanceof Error ? error.message : "查詢未能送出，請稍後再試。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-5 shadow-soft"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          團體名稱
          <input
            required
            value={organisationName}
            onChange={(event) => setOrganisationName(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
          />
        </label>
        <label className="text-sm font-semibold">
          聯絡人
          <input
            required
            value={contactPerson}
            onChange={(event) => setContactPerson(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
          />
        </label>
        <label className="text-sm font-semibold">
          電郵
          <input
            required
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
          />
        </label>
        <label className="text-sm font-semibold">
          電話 / WhatsApp
          <input
            required
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
          />
        </label>
        <label className="text-sm font-semibold sm:col-span-2">
          活動類型
          <select
            required
            value={activityType}
            onChange={(event) => setActivityType(event.target.value as GroupEnquiryActivityType)}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
          >
            {Object.entries(ACTIVITY_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {shouldShowOtherActivityDescription(activityType) && (
        <label className="block text-sm font-semibold">
          請描述活動內容
          <input
            required
            value={otherActivityDescription}
            onChange={(event) => setOtherActivityDescription(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
          />
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-sm font-semibold">
          預計參加人數
          <input
            type="number"
            min={1}
            value={participantCount}
            onChange={(event) => setParticipantCount(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
          />
        </label>
        <label className="text-sm font-semibold">
          參加者年齡層
          <input
            value={participantAgeProfile}
            onChange={(event) => setParticipantAgeProfile(event.target.value)}
            className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
          />
        </label>
      </div>

      <label className="block text-sm font-semibold">
        理想日期或時間
        <input
          value={preferredDateNotes}
          onChange={(event) => setPreferredDateNotes(event.target.value)}
          className="mt-1 min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
        />
      </label>

      <label className="block text-sm font-semibold">
        補充資料
        <textarea
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          className="mt-1 min-h-24 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-offset)] px-3 py-2"
        />
      </label>

      <TurnstileWidget
        language="zh-HK"
        resetKey={turnstileResetKey}
        onVerify={setTurnstileToken}
        onExpire={() => setTurnstileToken(null)}
      />

      {submitError && (
        <p
          role="alert"
          aria-live="assertive"
          className="text-sm font-semibold text-[var(--color-error)]"
        >
          {submitError}
        </p>
      )}
      {success && (
        <p
          role="status"
          aria-live="polite"
          className="rounded-md bg-[var(--color-primary-highlight)] px-3 py-2 text-sm font-bold text-[var(--color-primary)]"
        >
          查詢已送出，我們會盡快聯絡你。
        </p>
      )}

      <button
        type="submit"
        disabled={!canSubmit}
        className="btn-primary w-full disabled:opacity-60"
      >
        {submitting ? "送出中..." : "送出團體活動查詢"}
      </button>
    </form>
  );
}
