/**
 * Public navigation information architecture, ported from the hkscdagpt design
 * source (lib/site-links.ts @953ecba) per plan section 4.4.
 *
 * The source's cross-origin handoff helpers are dropped: after the merge every
 * destination is same-origin, so these are router links.
 *
 * Grouping only - no URL changes. Adopting this five-group IA over main's
 * seven-item bar is decision D-5, for which this is the plan's stated default.
 */
export type NavItem = { label: string; to: string };
export type NavGroup = { label: string; items: NavItem[] };

export const navGroups: NavGroup[] = [
  {
    label: "領養",
    items: [
      { label: "待領養貓隻", to: "/animals/cat" },
      { label: "待領養狗隻", to: "/animals/dog" },
      { label: "領養流程", to: "/adoption/instructions" },
      { label: "我的候選名單", to: "/adoption/apply" },
    ],
  },
  {
    label: "支持救援",
    items: [
      { label: "每月助養", to: "/sponsors" },
      { label: "立即捐助", to: "/donate" },
      { label: "成為義工", to: "/volunteer" },
      { label: "企業及團體參與", to: "/volunteer/group" },
    ],
  },
  {
    label: "我們的工作",
    items: [
      { label: "CCCP 社區貓護理", to: "/about/cccp" },
      { label: "TNR 捕捉絕育放回", to: "/about/tnr" },
      { label: "領養工作成效", to: "/report/adoption" },
    ],
  },
  {
    label: "故事與資源",
    items: [
      { label: "救援及領養故事", to: "/stories" },
      { label: "飼養知識", to: "/knowledge" },
      { label: "常見問題及聯絡", to: "/help" },
    ],
  },
  {
    label: "關於協會",
    items: [
      { label: "使命與歷史", to: "/about" },
      { label: "團隊與管治", to: "/about/team" },
      { label: "年報及審計報告", to: "/report/audit" },
      { label: "私隱政策", to: "/about/privacy" },
    ],
  },
];

export function isCurrentPath(pathname: string, to: string) {
  return pathname === to || (to !== "/" && pathname.startsWith(`${to}/`));
}

/** The deepest matching item wins, so /about/team highlights team, not /about. */
export function findCurrentNavigation(pathname: string) {
  let current: { groupIndex: number; to: string } | null = null;
  navGroups.forEach((group, groupIndex) => {
    group.items.forEach((item) => {
      if (!isCurrentPath(pathname, item.to)) return;
      if (!current || item.to.length > current.to.length) current = { groupIndex, to: item.to };
    });
  });
  return current as { groupIndex: number; to: string } | null;
}
