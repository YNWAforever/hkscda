import {
  BarChart3,
  Banknote,
  CalendarDays,
  Cat,
  ClipboardList,
  Dog,
  FilePlus2,
  HandCoins,
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
  | "cat"
  | "dog"
  | "sponsor"
  | "applications"
  | "payments"
  | "supporters"
  | "volunteers"
  | "content"
  | "access";

// Visual grouping for the sidebar. Purely presentational — the active-state
// logic below still keys off `section`/`activePath`, so routing is unchanged.
export type AdminNavGroup = "animals" | "adoptions" | "donations" | "promotion" | "system";

export type AdminNavItem = {
  id: string;
  section: AdminSection;
  group: AdminNavGroup;
  label: string;
  icon: LucideIcon;
  to: string;
  activePath?: string;
};

export const ADMIN_NAV_GROUPS: { id: AdminNavGroup; label: string }[] = [
  { id: "animals", label: "動物" },
  { id: "adoptions", label: "領養" },
  { id: "donations", label: "捐款" },
  { id: "promotion", label: "宣傳" },
  { id: "system", label: "系統" },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "cat",
    section: "cat",
    group: "animals",
    label: "貓貓",
    icon: Cat,
    to: "/admin?section=cat",
  },
  {
    id: "dog",
    section: "dog",
    group: "animals",
    label: "狗狗",
    icon: Dog,
    to: "/admin?section=dog",
  },
  {
    id: "sponsor",
    section: "sponsor",
    group: "animals",
    label: "助養",
    icon: Heart,
    to: "/admin?section=sponsor",
  },
  {
    id: "applications",
    section: "applications",
    group: "adoptions",
    label: "申請",
    icon: ClipboardList,
    to: "/admin/applications",
  },
  {
    id: "coordinator-inbox",
    section: "applications",
    group: "adoptions",
    label: "收件箱",
    icon: Inbox,
    to: "/admin/coordinator/inbox",
    activePath: "/admin/coordinator/inbox",
  },
  {
    id: "coordinator-intake",
    section: "applications",
    group: "adoptions",
    label: "手動建案",
    icon: FilePlus2,
    to: "/admin/coordinator/intake",
    activePath: "/admin/coordinator/intake",
  },
  {
    id: "coordinator-tasks",
    section: "applications",
    group: "adoptions",
    label: "工作跟進",
    icon: ListTodo,
    to: "/admin/coordinator/tasks",
    activePath: "/admin/coordinator/tasks",
  },
  {
    id: "coordinator-adopters",
    section: "applications",
    group: "adoptions",
    label: "領養人",
    icon: Users,
    to: "/admin/coordinator/adopters",
    activePath: "/admin/coordinator/adopters",
  },
  {
    id: "coordinator-reports",
    section: "applications",
    group: "adoptions",
    label: "報表紀錄",
    icon: BarChart3,
    to: "/admin/coordinator/reports",
    activePath: "/admin/coordinator/reports",
  },
  {
    id: "coordinator-statuses",
    section: "applications",
    group: "adoptions",
    label: "狀態設定",
    icon: Settings2,
    to: "/admin/coordinator/statuses",
    activePath: "/admin/coordinator/statuses",
  },
  {
    id: "volunteers",
    section: "volunteers",
    group: "adoptions",
    label: "義工",
    icon: CalendarDays,
    to: "/admin/volunteers",
    activePath: "/admin/volunteers",
  },
  {
    id: "payments",
    section: "payments",
    group: "donations",
    label: "收款",
    icon: Banknote,
    to: "/admin?section=payments",
  },
  {
    id: "supporters",
    section: "supporters",
    group: "donations",
    label: "支持者",
    icon: HandCoins,
    to: "/admin/supporters",
  },
  {
    id: "content",
    section: "content",
    group: "promotion",
    label: "宣傳內容",
    icon: Megaphone,
    to: "/admin/content",
    activePath: "/admin/content",
  },
  {
    id: "access-management",
    section: "access",
    group: "system",
    label: "權限管理",
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
