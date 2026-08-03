import type { ReactNode } from "react";

export function PublicPageHero({
  title,
  eyebrow,
  description,
  imageSrc,
  imageAlt,
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  imageSrc: string;
  imageAlt: string;
  actions?: ReactNode;
}) {
  return (
    <section className="relative isolate min-h-[420px] overflow-hidden bg-[var(--color-panel)] text-white sm:min-h-[500px]">
      <img
        src={imageSrc}
        alt={imageAlt}
        className="absolute inset-0 h-full w-full object-cover opacity-55"
      />
      <div className="absolute inset-0 bg-[var(--color-panel)]/65" aria-hidden="true" />
      <div className="relative mx-auto flex min-h-[420px] max-w-7xl items-end px-4 py-12 sm:min-h-[500px] sm:px-6 lg:px-8">
        <div className="max-w-2xl">
          {eyebrow ? (
            <p className="mb-3 text-sm font-bold tracking-wide text-white/85">{eyebrow}</p>
          ) : null}
          <h1 className="text-4xl font-bold leading-tight sm:text-6xl">{title}</h1>
          {description ? (
            <p className="mt-4 max-w-xl text-lg leading-relaxed text-white/90">{description}</p>
          ) : null}
          {actions ? <div className="mt-7 flex flex-wrap gap-3">{actions}</div> : null}
        </div>
      </div>
    </section>
  );
}
