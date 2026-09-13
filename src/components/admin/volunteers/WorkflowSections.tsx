export function WorkflowSections({ sections }: { sections: { id: string; label: string }[] }) {
  return (
    <nav
      aria-label="本頁步驟"
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
