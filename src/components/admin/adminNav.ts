import { canRoleAccessAdminNavItem } from "../../lib/admin/access";
import type { AdminRole } from "../../lib/admin/access";
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

export type AdminNavItem = {
  id: string;
  section: AdminSection;
  group: AdminNavGroup;
  label: string;
  icon: LucideIcon;
  to: string;
  activePath?: string;
};

export const ADMIN_NAV_GROUPS: {
  id: AdminNavGroup;
  label: string;
  icon: LucideIcon;
  defaultItemId: string;
}[] = [
  { id: "animals", label: "動物管理", icon: Cat, defaultItemId: "cat" },
  { id: "adoptions", label: "領養管理", icon: ClipboardList, defaultItemId: "applications" },
  { id: "volunteers", label: "義工與實習", icon: CalendarDays, defaultItemId: "volunteers" },
  { id: "donations", label: "捐款與助養", icon: HandCoins, defaultItemId: "payments" },
  { id: "promotion", label: "網站內容", icon: Megaphone, defaultItemId: "content" },
  { id: "system", label: "系統設定", icon: Settings2, defaultItemId: "access-management" },
];

export const ADMIN_NAV_ITEMS: AdminNavItem[] = [
  {
    id: "sponsorship-pledges",
    section: "payments",
    group: "donations",
    label: "助養收款及配對",
    icon: HandCoins,
    to: "/admin/sponsorships",
    activePath: "/admin/sponsorships",
  },
  {
    id: "internships",
    section: "volunteers",
    group: "volunteers",
    label: "實習申請",
    icon: ClipboardList,
    to: "/admin/internships",
    activePath: "/admin/internships",
  },
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
    group: "system",
    label: "狀態設定",
    icon: Settings2,
    to: "/admin/coordinator/statuses",
    activePath: "/admin/coordinator/statuses",
  },
  {
    id: "volunteers",
    section: "volunteers",
    group: "volunteers",
    label: "義工",
    icon: CalendarDays,
    to: "/admin/volunteers",
    activePath: "/admin/volunteers",
  },
  {
    id: "volunteer-settings",
    section: "volunteers",
    group: "volunteers",
    label: "義工政策設定",
    icon: Settings2,
    to: "/admin/volunteers/settings",
    activePath: "/admin/volunteers/settings",
  },
  {
    id: "volunteer-group-enquiries",
    section: "volunteers",
    group: "volunteers",
    label: "團體查詢",
    icon: ClipboardPenLine,
    to: "/admin/volunteers/group-enquiries",
    activePath: "/admin/volunteers/group-enquiries",
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
    id: "payment-methods",
    section: "payments",
    group: "system",
    label: "付款方式設定",
    icon: Settings2,
    to: "/admin/payment-methods",
    activePath: "/admin/payment-methods",
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
  },
  {
    id: "adoption-information",
    section: "content",
    group: "promotion",
    label: "領養資訊",
    icon: ClipboardPenLine,
    to: "/admin/content/adoption",
    activePath: "/admin/content/adoption",
  },
  {
    id: "knowledge",
    section: "content",
    group: "promotion",
    label: "知識庫",
    icon: ClipboardPenLine,
    to: "/admin/content/knowledge",
    activePath: "/admin/content/knowledge",
  },
  {
    id: "governance",
    section: "content",
    group: "promotion",
    label: "團隊與管治",
    icon: Users,
    to: "/admin/governance",
    activePath: "/admin/governance",
  },
  {
    id: "faq",
    section: "content",
    group: "promotion",
    label: "常見問題",
    icon: HelpCircle,
    to: "/admin/faq",
    activePath: "/admin/faq",
  },
  {
    id: "about-pages",
    section: "content",
    group: "promotion",
    label: "關於頁面",
    icon: FileText,
    to: "/admin/content/about",
    activePath: "/admin/content/about",
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
  const matches = items
    .map((item) => ({ item, path: item.activePath ?? (item.to.includes("?") ? null : item.to) }))
    .filter(({ path }) => path && (pathname === path || pathname.startsWith(`${path}/`)))
    .sort((a, b) => (b.path?.length ?? 0) - (a.path?.length ?? 0));
  if (matches[0]) return [matches[0].item.id];
  const fallback = items.find((item) => !item.activePath && item.section === activeSection);
  return fallback ? [fallback.id] : [];
}

export type AdminNavigationGroup = {
  id: AdminNavGroup;
  label: string;
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
    return destination
      ? [{ id: group.id, label: group.label, icon: group.icon, to: destination.to, items }]
      : [];
  });
  const activeId = getActiveAdminNavItemIds(allowed, pathname, activeSection)[0];
  return { groups, activeGroupId: allowed.find((item) => item.id === activeId)?.group ?? null };
}
