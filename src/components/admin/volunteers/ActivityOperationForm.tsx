import { useAdminLanguage } from "../adminI18n";
import { pickAdminCopy } from "../i18n/copy";
import { addHkDays } from "../../../lib/volunteers/bulk/service";
import {
  activityOperationCopy,
  BULK_OPERATIONS,
  type BulkOperation,
} from "./activityOperationCopy";
import type { OperationDraft, Template } from "./activityWorkspaceTypes";
import { volunteerCommonCopy } from "./volunteerCommonCopy";

const control =
  "min-h-11 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm";
const button =
  control +
  " cursor-pointer disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-[var(--color-primary)]";

/** The first template of each key, in the order the server sent them. */
function uniqueTemplates(templates: Template[]) {
  return Array.from(new Map(templates.map((t) => [t.template_key, t])).values());
}

/**
 * Step 2 of the activity workspace: choose a bulk operation and fill in what it needs. The page
 * keeps `draft`, so an edit started from the activity panel can fill the form in.
 */
export function ActivityOperationForm({
  draft,
  onChange,
  templates,
  previewDisabled,
  onPreview,
}: {
  draft: OperationDraft;
  onChange: (patch: Partial<OperationDraft>) => void;
  templates: Template[];
  previewDisabled: boolean;
  onPreview: () => void;
}) {
  const { language } = useAdminLanguage();
  const copy = pickAdminCopy(activityOperationCopy, language);
  const common = pickAdminCopy(volunteerCommonCopy, language);
  const text = copy.form;
  const { mode } = draft;
  return (
    <section
      className="space-y-3 rounded-lg border border-[var(--color-border)] p-4"
      aria-label={text.label}
    >
      <h2 className="text-lg font-bold">{text.title}</h2>
      <label>
        {text.action}{" "}
        <select
          aria-label={text.action}
          className={control}
          value={mode}
          onChange={(e) => onChange({ mode: e.target.value as BulkOperation, template: "" })}
        >
          {BULK_OPERATIONS.map((key) => (
            <option key={key} value={key}>
              {copy.operations[key]}
            </option>
          ))}
        </select>
      </label>
      {mode === "generate" && (
        <fieldset className="space-y-2">
          <legend>{text.templates}</legend>
          {uniqueTemplates(templates).map((t) => (
            <label key={t.template_key} className="flex min-h-11 items-center gap-2">
              <input
                type="checkbox"
                checked={draft.templateKeys.includes(t.template_key)}
                onChange={(e) =>
                  onChange({
                    templateKeys: e.target.checked
                      ? [...draft.templateKeys, t.template_key]
                      : draft.templateKeys.filter((k) => k !== t.template_key),
                  })
                }
              />
              {text.templateLine(t.name, common.shelterKey(t.shelter), t.start_time, t.end_time)}
            </label>
          ))}
        </fieldset>
      )}
      {["copy", "rebind"].includes(mode) && (
        <label className="block">
          {text.templateOrPolicy}{" "}
          <select
            className={control}
            value={draft.template}
            onChange={(e) => onChange({ template: e.target.value })}
          >
            <option value="">{text.choose(mode)}</option>
            {templates.map((t) => (
              <option key={t.version_id} value={mode === "rebind" ? t.version_id : t.template_key}>
                {text.templateLine(t.name, common.shelterKey(t.shelter), t.start_time, t.end_time)}
              </option>
            ))}
          </select>
        </label>
      )}
      {["generate", "copy"].includes(mode) && (
        <div className="space-y-2">
          <p>{text.generateNote}</p>
          <label>
            {text.start}{" "}
            <input
              type="date"
              className={control}
              value={draft.from}
              onChange={(e) => onChange({ from: e.target.value })}
            />
          </label>{" "}
          <label>
            {text.end}{" "}
            <input
              type="date"
              className={control}
              value={draft.until}
              onChange={(e) => onChange({ until: e.target.value })}
            />
          </label>
          <button className={button} onClick={() => onChange({ until: addHkDays(draft.from, 27) })}>
            {text.fourWeeks}
          </button>
          <button className={button} onClick={() => onChange({ until: addHkDays(draft.from, 55) })}>
            {text.eightWeeks}
          </button>
          <fieldset className="flex flex-wrap gap-3">
            <legend>{text.weekdays}</legend>
            {[0, 1, 2, 3, 4, 5, 6].map((n) => (
              <label key={n}>
                <input
                  type="checkbox"
                  checked={draft.weekdays.includes(n)}
                  onChange={(e) =>
                    onChange({
                      weekdays: e.target.checked
                        ? [...draft.weekdays, n]
                        : draft.weekdays.filter((v) => v !== n),
                    })
                  }
                />{" "}
                {text.weekday(n)}
              </label>
            ))}
          </fieldset>
          <label className="block">
            {text.excluded}
            <input
              className={control + " w-full"}
              value={draft.excluded}
              onChange={(e) => onChange({ excluded: e.target.value })}
            />
          </label>
        </div>
      )}
      {mode === "edit" && (
        <>
          <p>{text.editNote}</p>
          <label className="block">
            {text.newTitle}
            <input
              className={control + " w-full"}
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
            />
          </label>
          <label className="block">
            {text.newDescription}
            <textarea
              className={control + " w-full"}
              value={draft.description}
              onChange={(e) => onChange({ description: e.target.value })}
            />
          </label>
        </>
      )}
      {mode === "attendance" && (
        <div className="flex flex-wrap gap-3">
          <label>
            {text.attendanceStatus}
            <select
              className={control}
              value={draft.attendance}
              onChange={(e) => onChange({ attendance: e.target.value })}
            >
              <option value="attended">{text.attendanceOptions.attended}</option>
              <option value="completed">{text.attendanceOptions.completed}</option>
              <option value="no_show">{text.attendanceOptions.no_show}</option>
              <option value="not_marked">{text.attendanceOptions.not_marked}</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={draft.correction}
              onChange={(e) => onChange({ correction: e.target.checked })}
            />
            {text.correction}
          </label>
        </div>
      )}
      {!["generate", "copy", "edit"].includes(mode) && (
        <label className="block">
          {text.reason}
          <input
            className={control + " w-full"}
            value={draft.reason}
            onChange={(e) => onChange({ reason: e.target.value })}
          />
        </label>
      )}
      <button className={button} disabled={previewDisabled} onClick={onPreview}>
        {text.preview}
      </button>
      <p>{text.undecided}</p>
    </section>
  );
}
