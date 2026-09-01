export type AdminRole = "staff" | "treasurer" | "admin";
export type AdminStatus = "pending" | "active" | "disabled";

export type AdminDashboardSection =
  | "cat"
  | "dog"
  | "sponsor"
  | "applications"
  | "payments"
  | "supporters"
  | "volunteers"
  | "content"
  | "access";

export type AdminAccessArea =
  | "animals"
  | "adoptionCases"
  | "manualIntake"
  | "coordinatorTasks"
  | "adopters"
  | "coordinatorReports"
  | "coordinatorStatuses"
  | "payments"
  | "supporters"
  | "volunteerManagement"
  | "contentManagement"
  | "governanceManagement"
  | "sponsorshipReview"
  | "faqManagement"
  | "accessManagement";

export type AdminIdentity = {
  id: string;
  authUserId: string;
  email: string;
  role: AdminRole;
  status: AdminStatus;
};

const ROLE_ACCESS: Record<AdminRole, ReadonlySet<AdminAccessArea>> = {
  staff: new Set([
    "animals",
    "adoptionCases",
    "manualIntake",
    "coordinatorTasks",
    "adopters",
    "coordinatorReports",
    "volunteerManagement",
    "payments",
    "contentManagement",
    "sponsorshipReview",
    "faqManagement",
  ]),
  treasurer: new Set(["payments", "supporters"]),
  admin: new Set([
    "animals",
    "adoptionCases",
    "manualIntake",
    "coordinatorTasks",
    "adopters",
    "coordinatorReports",
    "coordinatorStatuses",
    "volunteerManagement",
    "payments",
    "supporters",
    "contentManagement",
    "governanceManagement",
    "sponsorshipReview",
    "faqManagement",
    "accessManagement",
  ]),
};

const NAV_ITEM_AREAS: Record<string, AdminAccessArea> = {
  cat: "animals",
  dog: "animals",
  sponsor: "animals",
  applications: "adoptionCases",
  "coordinator-inbox": "manualIntake",
  "coordinator-intake": "manualIntake",
  "coordinator-tasks": "coordinatorTasks",
  "coordinator-adopters": "adopters",
  "coordinator-reports": "coordinatorReports",
  "coordinator-statuses": "coordinatorStatuses",
  volunteers: "volunteerManagement",
  "volunteer-group-enquiries": "volunteerManagement",
  payments: "payments",
  "payment-methods": "payments",
  content: "contentManagement",
  "adoption-information": "contentManagement",
  knowledge: "contentManagement",
  governance: "governanceManagement",
  faq: "faqManagement",
  "about-pages": "contentManagement",
  supporters: "supporters",
  "access-management": "accessManagement",
};

const FIRST_ALLOWED_ROUTE: Record<AdminRole, string> = {
  staff: "/admin?section=cat",
  treasurer: "/admin?section=payments",
  admin: "/admin?section=cat",
};

export function canRoleAccessAdminArea(role: AdminRole, area: AdminAccessArea) {
  return ROLE_ACCESS[role].has(area);
}

export function getFirstAllowedAdminRoute(role: AdminRole) {
  return FIRST_ALLOWED_ROUTE[role];
}

export function getAdminAreaForLocation(input: {
  pathname: string;
  section?: AdminDashboardSection;
}): AdminAccessArea {
  if (input.pathname === "/admin") {
    return input.section === "payments" ? "payments" : "animals";
  }
  if (input.pathname.startsWith("/admin/animals")) return "animals";
  if (input.pathname.startsWith("/admin/applications")) return "adoptionCases";
  if (input.pathname.startsWith("/admin/coordinator/inbox")) return "manualIntake";
  if (input.pathname.startsWith("/admin/coordinator/intake")) return "manualIntake";
  if (input.pathname.startsWith("/admin/coordinator/tasks")) return "coordinatorTasks";
  if (input.pathname.startsWith("/admin/coordinator/adopters")) return "adopters";
  if (input.pathname.startsWith("/admin/coordinator/reports")) return "coordinatorReports";
  if (input.pathname.startsWith("/admin/coordinator/statuses")) return "coordinatorStatuses";
  if (input.pathname.startsWith("/admin/volunteers")) return "volunteerManagement";
  if (input.pathname.startsWith("/admin/supporters")) return "supporters";
  if (input.pathname.startsWith("/admin/content")) return "contentManagement";
  if (input.pathname.startsWith("/admin/governance")) return "governanceManagement";
  if (input.pathname.startsWith("/admin/faq")) return "faqManagement";
  if (input.pathname.startsWith("/admin/access")) return "accessManagement";
  return "animals";
}

export function filterAdminNavItemIdsByRole(itemIds: string[], role: AdminRole) {
  return itemIds.filter((itemId) => {
    const area = NAV_ITEM_AREAS[itemId];
    return area ? canRoleAccessAdminArea(role, area) : false;
  });
}

export function canRoleAccessAdminNavItem(itemId: string, role: AdminRole) {
  const area = NAV_ITEM_AREAS[itemId];
  return area ? canRoleAccessAdminArea(role, area) : false;
}
