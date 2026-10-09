import type { AdminLanguage } from "../../lib/admin/language";
import { adminCommonCopy } from "./i18n/adminCommonCopy";
import {
  ADMIN_NAV_GROUPS,
  ADMIN_NAV_ITEMS,
  getActiveAdminNavItemIds,
  type AdminSection,
} from "./adminNav";
import { getVolunteerWorkspacePage } from "./volunteerWorkspace";
import { volunteerWorkspaceCopy } from "./volunteerWorkspaceCopy";

/** One step of the breadcrumb. The page you are on has no `to`. */
export type BreadcrumbCrumb = { label: string; to?: string };

export type BreadcrumbOptions = {
  /** The section the route renders under; it picks the item for a path no item owns (`/admin`). */
  activeSection?: AdminSection;
  /**
   * Where the group crumb goes. The layout passes the group's first page this role can open, or
   * `null` while the role is unknown, when the crumb names the group without a link.
   */
  groupTo?: string | null;
};

/** The longest record name a crumb shows, ellipsis included. */
export const RECORD_NAME_MAX_LENGTH = 80;

// A record keyed by the union, so `tsc` fails when a section is added or removed here and not there.
const SECTION_KEYS: Record<AdminSection, true> = {
  tasks: true,
  cat: true,
  dog: true,
  sponsor: true,
  applications: true,
  payments: true,
  supporters: true,
  volunteers: true,
  content: true,
  access: true,
};

function isSection(value: string | null): value is AdminSection {
  return value !== null && Object.hasOwn(SECTION_KEYS, value);
}

/**
 * The name a crumb shows for a record, or `null` when there is nothing to show: a record still
 * loading, one that failed to load or was not found, and one whose name is empty all end the
 * trail at the destination instead of printing "undefined" or leaving an empty crumb.
 */
export function truncateRecordName(name: string | null | undefined): string | null {
  const trimmed = typeof name === "string" ? name.trim() : "";
  if (!trimmed) return null;
  // By code point, so a long name of emoji is never cut through a surrogate pair.
  const characters = Array.from(trimmed);
  if (characters.length <= RECORD_NAME_MAX_LENGTH) return trimmed;
  return `${characters
    .slice(0, RECORD_NAME_MAX_LENGTH - 1)
    .join("")
    .trimEnd()}…`;
}

/**
 * The volunteer workspace page a path belongs to, as a crumb. This is the one place the
 * breadcrumb reads the workspace's own page list (`VOLUNTEER_WORKSPACE_PAGES`); once those pages
 * are navigation items, only this function changes. The overview is the workspace root, which the
 * navigation item already names, so it has no crumb of its own.
 */
function resolveVolunteerPage(pathname: string, language: AdminLanguage): BreadcrumbCrumb | null {
  const page = getVolunteerWorkspacePage(pathname);
  if (!page || page.id === "overview") return null;
  return { label: volunteerWorkspaceCopy[language].pages[page.id].label, to: page.to };
}

/**
 * The breadcrumb of a page: its group, then its destination, then the record when the page is one.
 *
 * `pathname` may carry the dashboard's `?section=` the way a navigation item's `to` does.
 * Labels are the navigation's own copy, so the trail and the sidebar cannot disagree.
 */
export function breadcrumbTrail(
  pathname: string,
  language: AdminLanguage,
  recordName?: string | null,
  options: BreadcrumbOptions = {},
): BreadcrumbCrumb[] {
  const [rawPath, query = ""] = pathname.split("?");
  const path = rawPath.replace(/\/+$/, "") || "/";
  const querySection = new URLSearchParams(query).get("section");
  const section = options.activeSection ?? (isSection(querySection) ? querySection : "tasks");
  const copy = adminCommonCopy[language];

  const [itemId] = getActiveAdminNavItemIds(ADMIN_NAV_ITEMS, path, section);
  const item = ADMIN_NAV_ITEMS.find((candidate) => candidate.id === itemId);
  if (!item) return path === "/admin/tasks" ? [{ label: copy.layout.taskOverview }] : [];

  const group = ADMIN_NAV_GROUPS.find((candidate) => candidate.id === item.group);
  const groupDefault = ADMIN_NAV_ITEMS.find((candidate) => candidate.id === group?.defaultItemId);
  const trail: BreadcrumbCrumb[] = [
    {
      label: copy.navGroups[item.group],
      to: options.groupTo === null ? undefined : (options.groupTo ?? groupDefault?.to ?? item.to),
    },
    { label: copy.navItems[item.id], to: item.to },
  ];

  // The volunteer workspace's own pages sit one level under its navigation item.
  const workspacePage = item.id === "volunteers" ? resolveVolunteerPage(path, language) : null;
  if (workspacePage) trail.push(workspacePage);

  const name = truncateRecordName(recordName);
  if (name) trail.push({ label: name });

  // The page you are on is the last crumb and is not a link.
  trail[trail.length - 1] = { label: trail[trail.length - 1].label };
  return trail;
}
