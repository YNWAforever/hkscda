import { cn } from "../../lib/utils";

export function SectionHeading({
  title,
  eyebrow,
  description,
  align = "start",
  as = "h2",
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  align?: "start" | "center";
  as?: "h1" | "h2";
}) {
  const Heading = as;

  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? (
        <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--color-primary)]">
          {eyebrow}
        </p>
      ) : null}
      <Heading className="mt-3 text-3xl font-extrabold tracking-[-0.025em] text-[var(--color-text)] sm:text-4xl lg:text-5xl">
        {title}
      </Heading>
      {description ? (
        <p className="mt-3 text-base leading-relaxed text-[var(--color-text-muted)]">
          {description}
        </p>
      ) : null}
    </div>
  );
}
