import type { AdminRole } from "../../lib/admin/access";
import {
  ADMIN_NAV_ITEMS,
  getAdminNavChild,
  type AdminNavChild,
  type AdminNavChildGroup,
} from "./adminNav";

/**
 * One page of the volunteer workspace. It is a child of the volunteers navigation item, so the
 * pages, their groups and their roles are written once, in `adminNav.ts`. Its label and
 * description are in `volunteerWorkspaceCopy`, by `id`.
 */
export type VolunteerWorkspacePage = AdminNavChild;
export type VolunteerWorkspaceGroup = AdminNavChildGroup;

/** The groups the sidebar lists, in order. */
export const VOLUNTEER_WORKSPACE_GROUPS: readonly VolunteerWorkspaceGroup[] = [
  "daily",
  "people",
  "policy",
];

const volunteersItem = ADMIN_NAV_ITEMS.find((item) => item.id === "volunteers");

export const VOLUNTEER_WORKSPACE_PAGES: readonly VolunteerWorkspacePage[] =
  volunteersItem?.children ?? [];

export function getVolunteerNavigation(role: AdminRole | null): VolunteerWorkspacePage[] {
  if (!role) return [];
  return VOLUNTEER_WORKSPACE_PAGES.filter((page) => page.roles.includes(role));
}

export function getVolunteerWorkspacePage(pathname: string) {
  return volunteersItem ? getAdminNavChild(volunteersItem, pathname) : undefined;
}
