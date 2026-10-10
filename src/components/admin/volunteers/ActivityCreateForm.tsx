import { Plus } from "lucide-react";
import type { ReactNode } from "react";

import type { VolunteerActivityType } from "../../../lib/volunteers/types";
import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import type { ActivityDraft } from "./activityDraft";
import { volunteerCommonCopy } from "./volunteerCommonCopy";
import { volunteerRegistrationCopy } from "./volunteerRegistrationCopy";

const inputClass =
  "min-h-11 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]";

const buttonBase =
  "inline-flex min-h-9 cursor-pointer items-center justify-center gap-1 rounded-md px-3 py-1.5 text-xs font-semibold " +
  "transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-primary)] " +
  "disabled:cursor-not-allowed disabled:opacity-50";

/** Labelled field wrapper — the old form relied on placeholders alone, and the
 *  two number inputs had neither placeholder nor label. */
function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-[var(--color-panel)]">{label}</span>
      {children}
      {hint ? <span className="text-xs text-[var(--color-text-muted)]">{hint}</span> : null}
    </label>
  );
}

/** The form that creates an activity. The page keeps what is typed, so closing the form keeps it. */
export function ActivityCreateForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  pending,
  failed,
}: {
  draft: ActivityDraft;
  onChange: (patch: Partial<ActivityDraft>) => void;
  onSubmit: () => void;
  onCancel: () => void;
  pending: boolean;
  failed: boolean;
}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(volunteerRegistrationCopy, language).management.form;
  const types = pickAdminCopy(volunteerCommonCopy, language).activityType;
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="grid gap-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4 md:grid-cols-4"
    >
      <Field label={copy.title}>
        <input
          required
          value={draft.title}
          onChange={(event) => onChange({ title: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label={copy.type}>
        <select
          value={draft.type}
          onChange={(event) => onChange({ type: event.target.value as VolunteerActivityType })}
          className={inputClass}
        >
          {Object.entries(types).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </Field>
      <Field label={copy.startsAt}>
        <input
          required
          type="datetime-local"
          value={draft.startsAt}
          onChange={(event) => onChange({ startsAt: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label={copy.endsAt} hint={copy.optional}>
        <input
          type="datetime-local"
          value={draft.endsAt}
          onChange={(event) => onChange({ endsAt: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label={copy.location}>
        <input
          required
          value={draft.location}
          onChange={(event) => onChange({ location: event.target.value })}
          className={inputClass}
        />
      </Field>
      <Field label={copy.capacity} hint={copy.capacityHint}>
        <input
          type="number"
          min={1}
          value={draft.capacity}
          onChange={(event) => onChange({ capacity: Number(event.target.value) })}
          className={inputClass}
        />
      </Field>
      <Field label={copy.minAge} hint={copy.minAgeHint}>
        <input
          type="number"
          min={0}
          value={draft.minAge}
          onChange={(event) => onChange({ minAge: Number(event.target.value) })}
          className={inputClass}
        />
      </Field>
      <fieldset className="flex flex-wrap items-center gap-4 text-sm">
        <legend className="mb-1 text-xs font-semibold text-[var(--color-panel)]">
          {copy.settings}
        </legend>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draft.autoApprove}
            onChange={(event) => onChange({ autoApprove: event.target.checked })}
            className="h-4 w-4 cursor-pointer"
          />
          {copy.autoApprove}
        </label>
        <label className="flex cursor-pointer items-center gap-2">
          <input
            type="checkbox"
            checked={draft.allowGroups}
            onChange={(event) => onChange({ allowGroups: event.target.checked })}
            className="h-4 w-4 cursor-pointer"
          />
          {copy.allowGroups}
        </label>
      </fieldset>
      <div className="flex gap-2 md:col-span-4">
        <button
          type="submit"
          disabled={pending}
          className={`${buttonBase} min-h-11 bg-[var(--color-primary)] px-4 text-sm text-[var(--color-primary-foreground)] hover:opacity-90`}
        >
          <Plus className="h-4 w-4" />
          {pending ? copy.creating : copy.create}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className={`${buttonBase} min-h-11 border border-[var(--color-border)] px-4 text-sm hover:bg-[var(--color-surface-offset)]`}
        >
          {copy.cancel}
        </button>
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-[var(--color-error)] md:col-span-4">
          {copy.failed}
        </p>
      ) : null}
    </form>
  );
}
