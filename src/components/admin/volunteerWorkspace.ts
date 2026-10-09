import { canRoleAccessAdminArea, type AdminRole } from "../../lib/admin/access";
import type { VolunteerWorkspacePageId } from "./volunteerWorkspaceCopy";

/**
 * One page of the volunteer workspace. Its label and description are in `volunteerWorkspaceCopy`,
 * by `id`, so the navigation can be written in either language.
 */
export type VolunteerWorkspacePage = {
  id: VolunteerWorkspacePageId;
  to: string;
  group: "operations" | "settings";
};
const base = "/admin/volunteers";
export const VOLUNTEER_WORKSPACE_PAGES: readonly VolunteerWorkspacePage[] = [
  { id: "overview", to: base, group: "operations" },
  { id: "people", to: `${base}/people`, group: "operations" },
  { id: "activities", to: `${base}/activities`, group: "operations" },
  { id: "calendar", to: `${base}/calendar`, group: "operations" },
  { id: "tasks", to: `${base}/tasks`, group: "operations" },
  { id: "group-enquiries", to: `${base}/group-enquiries`, group: "operations" },
  { id: "operations", to: `${base}/operations`, group: "operations" },
  { id: "qualifications", to: `${base}/qualifications`, group: "operations" },
  { id: "settings", to: `${base}/settings`, group: "settings" },
  { id: "daily-settings", to: `${base}/daily-settings`, group: "settings" },
  { id: "assessments", to: `${base}/assessments`, group: "settings" },
  { id: "sources", to: `${base}/sources`, group: "settings" },
  { id: "simulation", to: `${base}/simulation`, group: "settings" },
];

export function getVolunteerNavigation(role: AdminRole | null) {
  if (!role) return [];
  return VOLUNTEER_WORKSPACE_PAGES.filter((page) =>
    canRoleAccessAdminArea(
      role,
      page.group === "settings" ? "volunteerPolicyManagement" : "volunteerManagement",
    ),
  );
}

export function getVolunteerWorkspacePage(pathname: string) {
  const path = pathname.replace(/\/+$/, "");
  if (path.startsWith(`${base}/registrations/`)) {
    return VOLUNTEER_WORKSPACE_PAGES.find((page) => page.id === "activities");
  }
  return VOLUNTEER_WORKSPACE_PAGES.find(
    (page) => path === page.to || (page.id !== "overview" && path.startsWith(`${page.to}/`)),
  );
}
