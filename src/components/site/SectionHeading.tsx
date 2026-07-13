import { cn } from "../../lib/utils";

export function SectionHeading({ title, eyebrow, description, align = "start" }: {
  title: string;
  eyebrow?: string;
  description?: string;
  align?: "start" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? <p className="text-sm font-bold tracking-wide text-[var(--color-secondary)]">{eyebrow}</p> : null}
      <h2 className="mt-2 text-3xl font-bold text-[var(--color-text)] sm:text-4xl">{title}</h2>
      {description ? <p className="mt-3 text-base leading-relaxed text-[var(--color-text-muted)]">{description}</p> : null}
    </div>
  );
}