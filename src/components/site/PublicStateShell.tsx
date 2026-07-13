import type { ReactNode } from "react";

export function PublicStateShell({ icon, title, description, action, role = "status" }: {
  icon?: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
  role?: "status" | "alert";
}) {
  return (
    <section role={role} aria-live={role === "alert" ? "assertive" : "polite"} className="mx-auto max-w-xl px-4 py-16 text-center">
      {icon ? <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center text-[var(--color-primary)]">{icon}</div> : null}
      <h1 className="text-2xl font-bold text-[var(--color-text)]">{title}</h1>
      <p className="mt-3 text-[var(--color-text-muted)]">{description}</p>
      {action ? <div className="mt-6">{action}</div> : null}
    </section>
  );
}