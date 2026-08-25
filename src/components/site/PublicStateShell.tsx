import type { ReactNode } from "react";

export function PublicStateShell({
  icon,
  title,
  description,
  action,
  role = "status",
}: {
  icon?: ReactNode;
  title: string;
  description: ReactNode;
  action?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <section
      role={role}
      aria-live={role === "alert" ? "assertive" : "polite"}
      className="public-state-shell mx-auto max-w-xl px-6 py-12 text-center sm:px-10 sm:py-16"
    >
      {icon ? (
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary-highlight)] text-[var(--color-primary)]">
          {icon}
        </div>
      ) : null}
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
      <div className="mt-3 text-[var(--color-text-muted)]">{description}</div>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}
