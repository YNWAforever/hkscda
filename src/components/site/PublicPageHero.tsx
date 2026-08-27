import type { ReactNode } from "react";

export function PublicPageHero({
  title,
  eyebrow,
  description,
  imageSrc,
  imageAlt,
  imageClassName = "",
  actions,
}: {
  title: string;
  eyebrow?: string;
  description?: string;
  imageSrc: string;
  imageAlt: string;
  imageClassName?: string;
  actions?: ReactNode;
}) {
  return (
    <section className="public-page-hero">
      <div className="public-page-hero-grid container-wide">
        <div className="public-page-hero-copy">
          {eyebrow ? (
            <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.14em] text-[var(--color-primary)]">
              {eyebrow}
            </p>
          ) : null}
          <h1 className="font-extrabold leading-[1.08] text-[var(--color-text)]">{title}</h1>
          {description ? (
            <p className="mt-5 max-w-2xl text-lg leading-relaxed text-[var(--color-text-muted)] sm:text-xl">
              {description}
            </p>
          ) : null}
          {actions ? (
            <div data-hero-actions className="mt-8 flex flex-wrap gap-3">
              {actions}
            </div>
          ) : null}
        </div>
        <figure className="public-page-hero-photo">
          <img src={imageSrc} alt={imageAlt} className={`h-full w-full ${imageClassName}`} />
        </figure>
      </div>
    </section>
  );
}
