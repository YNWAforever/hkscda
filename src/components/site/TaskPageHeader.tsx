import type { ReactNode } from "react";

/**
 * The compact member of the public hero family, for pages whose job is a form
 * or a lookup: the same ruled kicker and display H1 as the page heroes, without
 * the band and photograph that would push the form below the fold.
 */
export function TaskPageHeader({
  kicker,
  title,
  children,
  align = "start",
}: {
  kicker: string;
  title: ReactNode;
  children?: ReactNode;
  align?: "start" | "center";
}) {
  return (
    <header className={"task-header" + (align === "center" ? " task-header-center" : "")}>
      <p className="task-header-kicker">{kicker}</p>
      <h1>{title}</h1>
      {children ? <div className="task-header-lead">{children}</div> : null}
    </header>
  );
}
