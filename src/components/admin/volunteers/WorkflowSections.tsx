import { useSharedAdminCopy } from "../i18n/copy";
import { volunteerCommonCopy } from "./volunteerCommonCopy";

/**
 * Numbered links to the sections of a page. `label` names the list for assistive technology; without
 * one it is written in the admin's language. The public volunteer page passes its own, because it
 * shows Chinese whatever the admin's language is.
 */
export function WorkflowSections({
  sections,
  label,
}: {
  sections: { id: string; label: string }[];
  label?: string;
}) {
  const defaultLabel = useSharedAdminCopy(volunteerCommonCopy).stepsLabel;
  return (
    <nav
      aria-label={label ?? defaultLabel}
      className="flex flex-wrap gap-2 rounded-xl bg-[var(--color-surface-offset)] p-3"
    >
      {sections.map((s, i) => (
        <a
          key={s.id}
          href={`#${s.id}`}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-[var(--color-surface)] px-3 text-sm font-semibold"
        >
          <span className="text-[var(--color-text-muted)]">{i + 1}</span>
          {s.label}
        </a>
      ))}
    </nav>
  );
}
