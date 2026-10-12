import type { ReactNode } from "react";

import { revealOrder } from "../revealOnScroll";
import { keepTail } from "../keepTail";

/**
 * One heading anatomy for every home band: a ruled kicker, the H2, and an
 * optional standfirst that sits beside the title on wide screens. Keeping it in
 * one place is what stops the bands drifting between centred and split layouts.
 */
export function HomeSectionHeading({
  id,
  kicker,
  title,
  lead,
  action,
  tone = "default",
}: {
  id: string;
  kicker: string;
  title: ReactNode;
  lead?: ReactNode;
  action?: ReactNode;
  tone?: "default" | "inverse";
}) {
  return (
    <header className={"home-heading" + (tone === "inverse" ? " home-heading-inverse" : "")}>
      <div className="home-heading-main" data-reveal>
        <p className="home-kicker">{kicker}</p>
        <h2 id={id}>{title}</h2>
      </div>
      {lead || action ? (
        <div className="home-heading-aside" data-reveal style={revealOrder(1)}>
          {lead ? <p>{typeof lead === "string" ? keepTail(lead) : lead}</p> : null}
          {action}
        </div>
      ) : null}
    </header>
  );
}
