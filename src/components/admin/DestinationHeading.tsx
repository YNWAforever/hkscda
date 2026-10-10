import { useAdminLanguage } from "./adminI18n";
import type { AdminNavItemId } from "./adminNav";

type DestinationHeadingProps = { className?: string } & (
  | { id: AdminNavItemId; label?: never }
  | { label: string; id?: never }
);

/**
 * The `h1` of a record page while there is no record to name: loading, failed or not found.
 * It is the destination's label, the same words as the breadcrumb's destination crumb, so the
 * page always has exactly one `h1` and the mobile menu has a heading to move focus to. Pass a
 * navigation item `id`, or a `label` for a destination that is not a navigation item. Once the
 * record loads, the page's own `h1` names the record instead.
 */
export function DestinationHeading({
  id,
  label,
  className = "text-2xl font-bold text-[var(--color-panel)]",
}: DestinationHeadingProps) {
  const { copy } = useAdminLanguage();
  return <h1 className={className}>{label ?? (id ? copy.navItems[id] : "")}</h1>;
}
