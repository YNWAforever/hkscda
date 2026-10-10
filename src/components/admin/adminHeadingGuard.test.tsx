import { describe, expect, test } from "bun:test";

import { loadDestinations, withQueryState, type QueryState } from "./adminDestinationsTesting";
import { adminCopy, type AdminLanguage } from "./adminI18n";
import { ADMIN_NAV_ITEMS, type AdminNavItemId } from "./adminNav";
import { renderAdminInChinese, renderAdminInEnglish } from "./i18n/testing";
import { volunteerWorkspaceCopy, type VolunteerWorkspacePageId } from "./volunteerWorkspaceCopy";

/**
 * Every admin page has exactly one `h1`, in every state it can be in, and the `h1` is the page's
 * navigation label. A volunteer who clicks "Applications" lands on a page headed "Applications";
 * a screen reader and the mobile menu's focus move always find a heading, including while the
 * page loads or when it failed; and `AdminLayout` owns the page's only `<main>`.
 *
 * It renders the page behind every navigation item (and the task overview the layout links to
 * above them) in both languages, loading and with no data, the way `adminEnglishSmoke.test.tsx`
 * does, and the six record pages and the volunteer workspace pages the same way.
 *
 * A page whose `h1` is deliberately not its label must be listed in `DIFFERENT_H1` with the
 * reason. The entry pins the text the page shows, so it cannot hide a later change, and an entry
 * that the page no longer needs fails the suite. No assertion depends on the clock.
 */

const { DESTINATIONS, EXTRA_DESTINATIONS, RECORD_PAGES, VOLUNTEER_PAGES, ADOPTION_TABS } =
  await loadDestinations();

/** The volunteer workspace pages the navigation model registers under the volunteers item. */
const NAV_CHILD_IDS: ReadonlySet<string> = new Set(
  (ADMIN_NAV_ITEMS.find((item) => item.id === "volunteers")?.children ?? []).map(
    (child) => child.id,
  ),
);

const LANGUAGES: readonly AdminLanguage[] = ["en", "zh"];
const PAGE_STATES = ["loading", "empty", "error"] as const satisfies readonly QueryState[];
const RECORD_STATES = ["loading", "empty", "error"] as const satisfies readonly QueryState[];

type Allowance = {
  /** Why the `h1` is not the navigation label. Required. */
  reason: string;
  /** The `h1` the page shows in each language that differs from the label, pinned. */
  en?: string;
  zh?: string;
};

/**
 * The zh half of every page keeps today's wording: the admin's Chinese is not changed without the
 * owner's approval. The label each page should show instead is drafted in
 * `docs/superpowers/plans/2026-10-10-admin-audit-sp5b-owner-review.md`; approving it deletes the entry here and the
 * page's `zh` title, so the page follows the label in Chinese too.
 */
const ZH_PENDING_OWNER =
  "The Chinese heading keeps today's wording until the owner approves the drafted label (see docs/superpowers/plans/2026-10-10-admin-audit-sp5b-owner-review.md).";

const DIFFERENT_H1: Partial<Record<AdminNavItemId, Allowance>> = {
  internships: { zh: "獸醫學生實習申請", reason: ZH_PENDING_OWNER },
  cat: { zh: "動物管理", reason: ZH_PENDING_OWNER },
  dog: { zh: "動物管理", reason: ZH_PENDING_OWNER },
  sponsor: { zh: "動物管理", reason: ZH_PENDING_OWNER },
  applications: { zh: "領養個案", reason: ZH_PENDING_OWNER },
  "coordinator-inbox": { zh: "申請收件箱", reason: ZH_PENDING_OWNER },
  "coordinator-tasks": { zh: "協調員工作中心", reason: ZH_PENDING_OWNER },
  "coordinator-reports": { zh: "協調員報表", reason: ZH_PENDING_OWNER },
  "coordinator-statuses": { zh: "協調員狀態", reason: ZH_PENDING_OWNER },
  volunteers: { zh: "義工營運總覽", reason: ZH_PENDING_OWNER },
  payments: { zh: "收款紀錄", reason: ZH_PENDING_OWNER },
  "adoption-information": { zh: "領養資料管理", reason: ZH_PENDING_OWNER },
  knowledge: { zh: "知識專區", reason: ZH_PENDING_OWNER },
  "about-pages": { zh: "關於頁面管理", reason: ZH_PENDING_OWNER },
};

/**
 * The volunteer person page is headed by the workspace frame, not by the page: the frame writes
 * "Volunteer details" in every state and the person's name goes in the breadcrumb. That page
 * never shows an "empty" answer: it is either pending, failed or has the person.
 */
/**
 * What each volunteer workspace page is headed with. The breadcrumb's last crumb is the
 * navigation label for the three pages that are navigation items, and the workspace page's label
 * for the rest; the `h1` is the same words. The person page is headed by the frame, which writes
 * the generic title; the person's name is in the breadcrumb.
 */
const WORKSPACE_NAV_ITEM: Partial<Record<VolunteerWorkspacePageId, AdminNavItemId>> = {
  overview: "volunteers",
  settings: "volunteer-settings",
  "group-enquiries": "volunteer-group-enquiries",
};

/**
 * The Chinese heading of each workspace page whose wording differs from its label. Pinned. The
 * keys are the navigation model's own page ids (`VolunteerWorkspacePageId`), so `tsc` rejects a
 * pin for a page that was renamed or removed.
 */
const WORKSPACE_PINNED_ZH: Partial<Record<VolunteerWorkspacePageId, string>> = {
  overview: "義工營運總覽",
  activities: "義工活動工作台",
  calendar: "義工活動工作台",
  tasks: "義工今日待辦與通知",
  operations: "團體申請及義工改期",
  qualifications: "義工身份與資格核實",
  "daily-settings": "全日義工配額",
  assessments: "每月義工級別評核",
  sources: "共用來源、場地及資格",
};

const WORKSPACE_PINNED = new Map<VolunteerWorkspacePageId, Allowance>(
  (Object.entries(WORKSPACE_PINNED_ZH) as [VolunteerWorkspacePageId, string][]).map(([id, zh]) => [
    id,
    { zh, reason: ZH_PENDING_OWNER },
  ]),
);

/** The heading a workspace page would have with no pin: its navigation or workspace label. */
function workspaceLabel(id: VolunteerWorkspacePageId, language: AdminLanguage): string {
  const navItem = WORKSPACE_NAV_ITEM[id];
  if (navItem) return adminCopy[language].navItems[navItem];
  return volunteerWorkspaceCopy[language].pages[id].label;
}

function isWorkspacePageId(name: string): name is VolunteerWorkspacePageId {
  return NAV_CHILD_IDS.has(name);
}

function expectedWorkspaceHeading(name: string, language: AdminLanguage): string {
  if (name === "person") return volunteerWorkspaceCopy[language].intros.person.title;
  if (!isWorkspacePageId(name)) throw new Error(`"${name}" is not a volunteer workspace page`);
  return WORKSPACE_PINNED.get(name)?.[language] ?? workspaceLabel(name, language);
}

const VOLUNTEER_PAGE_STATES: Partial<Record<string, readonly QueryState[]>> = {
  person: ["loading", "error"],
};

function render(language: AdminLanguage, page: () => import("react").ReactElement): string {
  return language === "en" ? renderAdminInEnglish(page()) : renderAdminInChinese(page());
}

function decode(text: string): string {
  return text
    .replace(/<[^>]*>/g, "")
    .replace(/&#x27;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/** The text of every `h1` in the markup, in order. */
function headings(markup: string): string[] {
  return [...markup.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map((match) => decode(match[1]));
}

function expectOneHeading(markup: string, where: string): string {
  const found = headings(markup);
  expect(found, `${where} should have exactly one h1, found ${found.length}`).toHaveLength(1);
  expect(found[0].length, `${where} has an empty h1`).toBeGreaterThan(0);
  return found[0];
}

function expectNoNestedMain(markup: string, where: string) {
  expect(markup, `${where} must not render a <main>; AdminLayout owns it`).not.toContain("<main");
}

describe("every navigation destination has one h1 that is its label", () => {
  for (const language of LANGUAGES) {
    for (const item of ADMIN_NAV_ITEMS) {
      for (const state of PAGE_STATES) {
        test(`${item.id} in ${language}, ${state}`, () => {
          const where = `${item.id} (${language}, ${state})`;
          const markup = withQueryState(state, () => render(language, DESTINATIONS[item.id].page));
          const heading = expectOneHeading(markup, where);
          expectNoNestedMain(markup, where);

          const label = adminCopy[language].navItems[item.id];
          const allowance = DIFFERENT_H1[item.id];
          const pinned = allowance?.[language];
          if (pinned !== undefined) {
            expect(heading, `${where} no longer shows its pinned h1`).toBe(pinned);
            expect(pinned, `${where} is allow-listed but equals its label`).not.toBe(label);
          } else {
            expect(heading, `${where} should be headed with its navigation label`).toBe(label);
          }
        });
      }
    }
  }

  test("every allow-list entry names a real navigation item and gives a reason", () => {
    const ids = new Set(ADMIN_NAV_ITEMS.map((item) => item.id));
    for (const [id, allowance] of Object.entries(DIFFERENT_H1)) {
      expect(ids.has(id as AdminNavItemId), `${id} is not a navigation item`).toBe(true);
      expect(allowance.reason.trim().length, `${id} needs a reason`).toBeGreaterThan(20);
      expect(allowance.en !== undefined || allowance.zh !== undefined, `${id} pins nothing`).toBe(
        true,
      );
    }
  });
});

describe("the task overview has one h1 and no main", () => {
  for (const language of LANGUAGES) {
    for (const state of PAGE_STATES) {
      test(`in ${language}, ${state}`, () => {
        const where = `task overview (${language}, ${state})`;
        const markup = withQueryState(state, () =>
          render(language, EXTRA_DESTINATIONS["task-overview"].page),
        );
        expect(expectOneHeading(markup, where)).toBe(adminCopy[language].layout.taskOverview);
        expectNoNestedMain(markup, where);
      });
    }
  }
});

describe("a record page has one h1 before its record is there", () => {
  for (const [name, record] of Object.entries(RECORD_PAGES)) {
    for (const language of LANGUAGES) {
      for (const state of RECORD_STATES) {
        test(`${name} in ${language}, ${state}`, () => {
          const where = `${name} (${language}, ${state})`;
          const markup = withQueryState(state, () => render(language, () => record.page(state)));
          const heading = expectOneHeading(markup, where);
          expectNoNestedMain(markup, where);

          // The destination the breadcrumb names: the navigation item, or the workspace page.
          const destination = record.nav
            ? adminCopy[language].navItems[record.nav]
            : volunteerWorkspaceCopy[language].pages[record.workspacePage!].label;
          expect(heading, `${where} should be headed with its destination`).toBe(destination);
        });
      }
    }
  }
});

describe("a volunteer workspace page has one h1, from the page or from the frame, never both", () => {
  for (const [name, page] of Object.entries(VOLUNTEER_PAGES)) {
    for (const language of LANGUAGES) {
      for (const state of VOLUNTEER_PAGE_STATES[name] ?? PAGE_STATES) {
        test(`${name} in ${language}, ${state}`, () => {
          const where = `volunteer ${name} (${language}, ${state})`;
          const markup = withQueryState(state, () => render(language, page));
          const heading = expectOneHeading(markup, where);
          expectNoNestedMain(markup, where);
          expect(heading, `${where} should be headed with its label`).toBe(
            expectedWorkspaceHeading(name, language),
          );
        });
      }
    }
  }
});

const ZH_TAB_HEADINGS: Record<keyof typeof ADOPTION_TABS, Allowance> = {
  fees: { zh: "領養資料管理", reason: ZH_PENDING_OWNER },
  page: { zh: "領養資料管理", reason: ZH_PENDING_OWNER },
  estates: { zh: "領養資料管理", reason: ZH_PENDING_OWNER },
  rules: { zh: "領養規則管理", reason: ZH_PENDING_OWNER },
  careTopics: { zh: "動物照顧須知管理", reason: ZH_PENDING_OWNER },
};

describe("every tab of the adoption information page has one h1", () => {
  // The tabs draw different editors. English heads all of them with the navigation label; the
  // Chinese headings keep today's wording, which differs per tab until the owner approves a label.

  for (const [tab, page] of Object.entries(ADOPTION_TABS)) {
    for (const language of LANGUAGES) {
      for (const state of PAGE_STATES) {
        test(`${tab} in ${language}, ${state}`, () => {
          const where = `adoption information, ${tab} tab (${language}, ${state})`;
          const markup = withQueryState(state, () => render(language, page));
          const heading = expectOneHeading(markup, where);
          expectNoNestedMain(markup, where);
          expect(heading, where).toBe(
            language === "en"
              ? adminCopy.en.navItems["adoption-information"]
              : (ZH_TAB_HEADINGS[tab as keyof typeof ZH_TAB_HEADINGS].zh ?? ""),
          );
        });
      }
    }
  }
});

describe("a pinned heading is only allowed while it differs from its label", () => {
  test("every workspace pin has a reason and differs from the label", () => {
    for (const [name, allowance] of WORKSPACE_PINNED) {
      expect(allowance.reason.trim().length, `${name} needs a reason`).toBeGreaterThan(20);
      expect(allowance.zh, `${name} is pinned but equals its label`).not.toBe(
        workspaceLabel(name, "zh"),
      );
    }
  });

  test("every workspace pin and every workspace page is a page of the navigation model", () => {
    for (const name of WORKSPACE_PINNED.keys()) {
      expect(NAV_CHILD_IDS.has(name), `${name} is pinned but is not a navigation page`).toBe(true);
    }
    for (const id of NAV_CHILD_IDS) {
      expect(Object.hasOwn(VOLUNTEER_PAGES, id), `${id} has no page rendered here`).toBe(true);
    }
  });

  test("every adoption tab pin has a reason and differs from the label", () => {
    for (const [tab, allowance] of Object.entries(ZH_TAB_HEADINGS)) {
      expect(allowance.reason.trim().length, `${tab} needs a reason`).toBeGreaterThan(20);
      expect(allowance.zh, `${tab} is pinned but equals its label`).not.toBe(
        adminCopy.zh.navItems["adoption-information"],
      );
    }
  });
});
