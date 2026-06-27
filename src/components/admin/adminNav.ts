export type AdminSection = "cat" | "dog" | "sponsor" | "applications" | "payments" | "supporters";

export type AdminNavItem = {
  id: string;
  section: AdminSection;
  label: string;
  to: string;
  activePath?: string;
};

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  { id: "cat", section: "cat", label: "🐱 貓貓", to: "/admin?section=cat" },
  { id: "dog", section: "dog", label: "🐶 狗狗", to: "/admin?section=dog" },
  { id: "sponsor", section: "sponsor", label: "💛 助養", to: "/admin?section=sponsor" },
  {
    id: "applications",
    section: "applications",
    label: "📋 申請",
    to: "/admin/applications",
  },
  {
    id: "coordinator-statuses",
    section: "applications",
    label: "狀態設定",
    to: "/admin/coordinator/statuses",
    activePath: "/admin/coordinator/statuses",
  },
  {
    id: "coordinator-tasks",
    section: "applications",
    label: "工作跟進",
    to: "/admin/coordinator/tasks",
    activePath: "/admin/coordinator/tasks",
  },
  {
    id: "coordinator-adopters",
    section: "applications",
    label: "領養人",
    to: "/admin/coordinator/adopters",
    activePath: "/admin/coordinator/adopters",
  },
  { id: "payments", section: "payments", label: "收款", to: "/admin?section=payments" },
  { id: "supporters", section: "supporters", label: "捐款人", to: "/admin/supporters" },
];

export function getActiveAdminNavItemIds(
  items: AdminNavItem[],
  pathname: string,
  activeSection: AdminSection,
) {
  const hasPathSpecificActive = items.some((item) =>
    item.activePath
      ? pathname === item.activePath || pathname.startsWith(`${item.activePath}/`)
      : false,
  );

  return items
    .filter((item) => {
      if (item.activePath) {
        return pathname === item.activePath || pathname.startsWith(`${item.activePath}/`);
      }
      if (hasPathSpecificActive) return false;
      return activeSection === item.section;
    })
    .map((item) => item.id);
}
