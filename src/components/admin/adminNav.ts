import { canRoleAccessAdminNavItem } from "../../lib/admin/access";
import type { AdminRole } from "../../lib/admin/access";
import type { VolunteerWorkspacePageId } from "./volunteerWorkspaceCopy";
import {
  BarChart3,
  Banknote,
  CalendarDays,
  ClipboardPenLine,
  Cat,
  ClipboardList,
  Dog,
  FilePlus2,
  FileText,
  HandCoins,
  HelpCircle,
  Heart,
  Inbox,
  ListTodo,
  Megaphone,
  ShieldCheck,
  Settings2,
  Users,
  type LucideIcon,
} from "lucide-react";

export type AdminSection =
  | "tasks"
  | "cat"
  | "dog"
  | "sponsor"
  | "applications"
  | "payments"
  | "supporters"
  | "volunteers"
  | "content"
  | "access";

// Domain grouping shares the existing destination access matrix.
export type AdminNavGroup =
  | "animals"
  | "adoptions"
  | "volunteers"
  | "donations"
  | "promotion"
  | "system";

/**
 * Every navigation item id. The shared copy (`adminCommonCopy.navItems`) is keyed by this
 * union, so `tsc` fails when an item has no label in either language. Item and group names
 * are copy, not data: they are read from there, never stored on the item.
 */
export type AdminNavItemId =
  | "sponsorship-pledges"
  | "internships"
  | "cat"
  | "dog"
  | "sponsor"
  | "applications"
  | "coordinator-inbox"
  | "coordinator-intake"
  | "coordinator-tasks"
  | "coordinator-adopters"
  | "coordinator-reports"
  | "coordinator-statuses"
  | "volunteers"
  | "volunteer-settings"
  | "volunteer-group-enquiries"
  | "payments"
  | "payment-methods"
  | "supporters"
  | "content"
  | "adoption-information"
  | "knowledge"
  | "governance"
  | "faq"
  | "about-pages"
  | "access-management";

/** The three groups of the volunteer workspace sidebar, in the order it lists them. */
export type AdminNavChildGroup = "daily" | "people" | "policy";

/**
 * A page that sits under a navigation item without being a destination of its own in the main
 * navigation. Its label is copy (`volunteerWorkspaceCopy.pages`), keyed by `id`.
 */
export type AdminNavChild = {
  id: VolunteerWorkspacePageId;
  to: string;
  group: AdminNavChildGroup;
  /** The roles that may open the page; the test suite checks them against `lib/admin/access.ts`. */
  roles: readonly AdminRole[];
};

export type AdminNavItem = {
  id: AdminNavItemId;
  section: AdminSection;
  group: AdminNavGroup;
  icon: LucideIcon;
  to: string;
  activePath?: string;
  /** Pages under this item, listed by the item's own workspace sidebar. */
  children?: readonly AdminNavChild[];
};

const DAILY_ROLES: readonly AdminRole[] = ["staff", "admin"];
const POLICY_ROLES: readonly AdminRole[] = ["admin"];
const VOLUNTEERS = "/admin/volunteers";

/**
 * The thirteen pages of the volunteer workspace, in the order its sidebar lists them. The daily
 * and people pages are open to staff and administrators (`volunteerManagement`); the policy
 * pages to administrators only (`volunteerPolicyManagement`).
 */
const VOLUNTEER_CHILDREN: readonly AdminNavChild[] = [
  { id: "overview", to: VOLUNTEERS, group: "daily", roles: DAILY_ROLES },
  { id: "tasks", to: `${VOLUNTEERS}/tasks`, group: "daily", roles: DAILY_ROLES },
  { id: "calendar", to: `${VOLUNTEERS}/calendar`, group: "daily", roles: DAILY_ROLES },
  { id: "activities", to: `${VOLUNTEERS}/activities`, group: "daily", roles: DAILY_ROLES },
  { id: "operations", to: `${VOLUNTEERS}/operations`, group: "daily", roles: DAILY_ROLES },
  {
    id: "group-enquiries",
    to: `${VOLUNTEERS}/group-enquiries`,
    group: "daily",
    roles: DAILY_ROLES,
  },
  { id: "people", to: `${VOLUNTEERS}/people`, group: "people", roles: DAILY_ROLES },
  {
    id: "qualifications",
    to: `${VOLUNTEERS}/qualifications`,
    group: "people",
    roles: DAILY_ROLES,
  },
  { id: "settings", to: `${VOLUNTEERS}/settings`, group: "policy", roles: POLICY_ROLES },
  {
    id: "daily-settings",
    to: `${VOLUNTEERS}/daily-settings`,
    group: "policy",
    roles: POLICY_ROLES,
  },
  { id: "assessments", to: `${VOLUNTEERS}/assessments`, group: "policy", roles: POLICY_ROLES },
  { id: "sources", to: `${VOLUNTEERS}/sources`, group: "policy", roles: POLICY_ROLES },
  { id: "simulation", to: `${VOLUNTEERS}/simulation`, group: "policy", roles: POLICY_ROLES },
];

export const ADMIN_NAV_GROUPS: {
  id: AdminNavGroup;
  icon: LucideIcon;
  defaultItemId: AdminNavItemId;
}[] = [
  { id: "animals", icon: Cat, defaultItemId: "cat" },
  { id: "adoptions", icon: ClipboardList, defaultItemId: "applications" },
  { id: "volunteers", icon: CalendarDays, defaultItemId: "volunteers" },
  { id: "donations", icon: HandCoins, defaultItemId: "payments" },
  { id: "promotion", icon: Megaphone, defaultItemId: "content" },
  { id: "system", icon: Settings2, defaultItemId: "access-management" },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "sponsorship-pledges",
    section: "payments",
    group: "donations",
    icon: HandCoins,
    to: "/admin/sponsorships",
    activePath: "/admin/sponsorships",
  },
  {
    id: "internships",
    section: "volunteers",
    group: "volunteers",
    icon: ClipboardList,
    to: "/admin/internships",
    activePath: "/admin/internships",
  },
  {
    id: "cat",
    section: "cat",
    group: "animals",
    icon: Cat,
    to: "/admin?section=cat",
  },
  {
    id: "dog",
    section: "dog",
    group: "animals",
    icon: Dog,
    to: "/admin?section=dog",
  },
  {
    id: "sponsor",
    section: "sponsor",
    group: "animals",
    icon: Heart,
    to: "/admin?section=sponsor",
  },
  {
    id: "applications",
    section: "applications",
    group: "adoptions",
    icon: ClipboardList,
    to: "/admin/applications",
  },
  {
    id: "coordinator-inbox",
    section: "applications",
    group: "adoptions",
    icon: Inbox,
    to: "/admin/coordinator/inbox",
    activePath: "/admin/coordinator/inbox",
  },
  {
    id: "coordinator-intake",
    section: "applications",
    group: "adoptions",
    icon: FilePlus2,
    to: "/admin/coordinator/intake",
    activePath: "/admin/coordinator/intake",
  },
  {
    id: "coordinator-tasks",
    section: "applications",
    group: "adoptions",
    icon: ListTodo,
    to: "/admin/coordinator/tasks",
    activePath: "/admin/coordinator/tasks",
  },
  {
    id: "coordinator-adopters",
    section: "applications",
    group: "adoptions",
    icon: Users,
    to: "/admin/coordinator/adopters",
    activePath: "/admin/coordinator/adopters",
  },
  {
    id: "coordinator-reports",
    section: "applications",
    group: "adoptions",
    icon: BarChart3,
    to: "/admin/coordinator/reports",
    activePath: "/admin/coordinator/reports",
  },
  {
    id: "coordinator-statuses",
    section: "applications",
    group: "system",
    icon: Settings2,
    to: "/admin/coordinator/statuses",
    activePath: "/admin/coordinator/statuses",
  },
  {
    id: "volunteers",
    section: "volunteers",
    group: "volunteers",
    icon: CalendarDays,
    to: "/admin/volunteers",
    activePath: "/admin/volunteers",
    children: VOLUNTEER_CHILDREN,
  },
  {
    id: "volunteer-settings",
    section: "volunteers",
    group: "volunteers",
    icon: Settings2,
    to: "/admin/volunteers/settings",
    activePath: "/admin/volunteers/settings",
  },
  {
    id: "volunteer-group-enquiries",
    section: "volunteers",
    group: "volunteers",
    icon: ClipboardPenLine,
    to: "/admin/volunteers/group-enquiries",
    activePath: "/admin/volunteers/group-enquiries",
  },
  {
    id: "payments",
    section: "payments",
    group: "donations",
    icon: Banknote,
    to: "/admin?section=payments",
  },
  {
    id: "payment-methods",
    section: "payments",
    group: "system",
    icon: Settings2,
    to: "/admin/payment-methods",
    activePath: "/admin/payment-methods",
  },
  {
    id: "supporters",
    section: "supporters",
    group: "donations",
    icon: HandCoins,
    to: "/admin/supporters",
  },
  {
    id: "content",
    section: "content",
    group: "promotion",
    icon: Megaphone,
    to: "/admin/content",
  },
  {
    id: "adoption-information",
    section: "content",
    group: "promotion",
    icon: ClipboardPenLine,
    to: "/admin/content/adoption",
    activePath: "/admin/content/adoption",
  },
  {
    id: "knowledge",
    section: "content",
    group: "promotion",
    icon: ClipboardPenLine,
    to: "/admin/content/knowledge",
    activePath: "/admin/content/knowledge",
  },
  {
    id: "governance",
    section: "content",
    group: "promotion",
    icon: Users,
    to: "/admin/governance",
    activePath: "/admin/governance",
  },
  {
    id: "faq",
    section: "content",
    group: "promotion",
    icon: HelpCircle,
    to: "/admin/faq",
    activePath: "/admin/faq",
  },
  {
    id: "about-pages",
    section: "content",
    group: "promotion",
    icon: FileText,
    to: "/admin/content/about",
    activePath: "/admin/content/about",
  },
  {
    id: "access-management",
    section: "access",
    group: "system",
    icon: ShieldCheck,
    to: "/admin/access",
    activePath: "/admin/access",
  },
];

export function getActiveAdminNavItemIds(
  items: AdminNavItem[],
  pathname: string,
  activeSection: AdminSection,
) {
  const matches = items
    .map((item) => ({ item, path: item.activePath ?? (item.to.includes("?") ? null : item.to) }))
    .filter(({ path }) => path && (pathname === path || pathname.startsWith(`${path}/`)))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0));
  if (matches[0]) return [matches[0].item.id];
  const fallback = items.find((item) => !item.activePath && item.section === activeSection);
  return fallback ? [fallback.id] : [];
}

/**
 * The child of `item` that owns `pathname`, if any. The item's own path matches only exactly, so
 * the workspace overview does not claim every page under it; a registration detail belongs to the
 * activities page it is reached from.
 */
export function getAdminNavChild(item: AdminNavItem, pathname: string): AdminNavChild | undefined {
  const children = item.children;
  if (!children) return undefined;
  const path = pathname.replace(/\/+$/, "");
  if (item.id === "volunteers" && path.startsWith(`${VOLUNTEERS}/registrations/`)) {
    return children.find((child) => child.id === "activities");
  }
  return children.find(
    (child) => path === child.to || (child.to !== item.to && path.startsWith(`${child.to}/`)),
  );
}

export type AdminNavigationGroup = {
  id: AdminNavGroup;
  icon: LucideIcon;
  to: string;
  items: AdminNavItem[];
};

export function getAdminNavigation(
  role: AdminRole | null,
  pathname: string,
  activeSection: AdminSection,
): { groups: AdminNavigationGroup[]; activeGroupId: AdminNavGroup | null } {
  if (!role) return { groups: [], activeGroupId: null };
  const allowed = ADMIN_NAV_ITEMS.filter((item) => canRoleAccessAdminNavItem(item.id, role));
  const groups = ADMIN_NAV_GROUPS.flatMap((group) => {
    const items = allowed.filter((item) => item.group === group.id);
    const destination = items.find((item) => item.id === group.defaultItemId) ?? items[0];
    return destination ? [{ id: group.id, icon: group.icon, to: destination.to, items }] : [];
  });
  const activeId = getActiveAdminNavItemIds(allowed, pathname, activeSection)[0];
  return { groups, activeGroupId: allowed.find((item) => item.id === activeId)?.group ?? null };
}
