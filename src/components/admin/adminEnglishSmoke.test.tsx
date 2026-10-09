import { describe, expect, mock, test } from "bun:test";
import type { ReactElement, ReactNode } from "react";

import type { AdminListSearch } from "../../lib/animals/adminListState";
import { adminCopy } from "./adminI18n";
import { ADMIN_NAV_ITEMS, type AdminNavItemId } from "./adminNav";
import { expectNoChineseText, renderAdminInEnglish } from "./i18n/testing";

/**
 * The smoke test of the finished English admin: it renders the page behind every destination of
 * the navigation (`ADMIN_NAV_ITEMS`) in English and fails on any Chinese left in the markup.
 *
 * There is no allow-list. Every query is either still loading or has answered with nothing, so
 * no stored Chinese data can reach the page, and the only Chinese that could appear is interface
 * text that was never translated. Anything that fails here is a missing translation.
 *
 * The area tests (`*English.test.tsx`) check each screen in depth, with data, dialogs and errors.
 * This test checks that no destination was left out: `DESTINATIONS` is keyed by every
 * navigation item id, so `tsc` rejects a new item without a page here, and the last test fails
 * the suite if the number of pages rendered differs from the navigation's.
 *
 * It renders each page without the layout (`AdminLayout`, `VolunteerAdminShell`) around it. The
 * layouts have their own English tests, and their language switch names each language in its
 * own language, which is the one Chinese word an English screen shows by design.
 *
 * No assertion depends on the clock. Some pages print today's date, so the markup differs from
 * one day to the next, but no check here looks at a date.
 */

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realRouter = await import("@tanstack/react-router");
const realQuery = await import("@tanstack/react-query");

/**
 * What every `useQuery` answers. `loading` is a request that has not come back, `empty` is one
 * that came back with nothing. The signed-in admin (`admin-me`) is always known, so a page that
 * waits for it shows its real content.
 */
type QueryState = "loading" | "empty";
let queryState: QueryState = "loading";

mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  Link: ({
    children,
    className,
    to,
    params,
  }: {
    children?: ReactNode;
    className?: string;
    to: string;
    params?: Record<string, string>;
  }) => (
    <a
      href={Object.entries(params ?? {}).reduce(
        (path, [key, value]) => path.replace(`$${key}`, value),
        to,
      )}
      className={className}
    >
      {children}
    </a>
  ),
  useNavigate: () => async () => {},
  useBlocker: () => ({ status: "idle", reset() {}, proceed() {} }),
  useRouterState: ({ select }: { select: (value: unknown) => unknown }) =>
    select({ location: { pathname: "/admin" } }),
}));

mock.module("@tanstack/react-query", () => ({
  ...realQuery,
  useQueryClient: () => ({
    invalidateQueries: async () => {},
    clear: () => {},
    getQueryData: () => undefined,
  }),
  useMutation: () => ({
    mutate() {},
    mutateAsync: async () => {},
    reset() {},
    isPending: false,
    isError: false,
    isSuccess: false,
    error: null,
    data: undefined,
    variables: undefined,
  }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => {
    if (String(queryKey[0]) === "admin-me") {
      return {
        data: {
          admin: { id: "admin-1", email: "admin@example.test", role: "admin", status: "active" },
        },
        isSuccess: true,
      };
    }
    return {
      data: undefined,
      error: null,
      isError: false,
      isLoading: queryState === "loading",
      isPending: queryState === "loading",
      isFetching: false,
      isSuccess: false,
      isPlaceholderData: false,
      refetch() {},
    };
  },
}));

const { AdminDashboardContent } = await import("../../routes/admin/index");
const { SponsorshipsContent } = await import("../../routes/admin/sponsorships");
const { AccessManagement } = await import("./access/AccessManagement");
const { AdopterList } = await import("./adoptions/AdopterList");
const { CaseList } = await import("./adoptions/CaseList");
const { CoordinatorReports } = await import("./adoptions/CoordinatorReports");
const { IntakeInbox } = await import("./adoptions/IntakeInbox");
const { ManualCaseIntake } = await import("./adoptions/ManualCaseIntake");
const { StatusAdmin } = await import("./adoptions/StatusAdmin");
const { TaskCenter } = await import("./adoptions/TaskCenter");
const { AboutPagesManagement } = await import("./content/AboutPagesManagement");
const { AdoptionInformationManagement } = await import("./content/AdoptionInformationManagement");
const { ContentManagement } = await import("./content/ContentManagement");
const { FaqManagement } = await import("./content/FaqManagement");
const { GovernanceManagement } = await import("./content/GovernanceManagement");
const { KnowledgeManagement } = await import("./content/KnowledgeManagement");
const { PaymentMethodsManagement } = await import("./content/PaymentMethodsManagement");
const { SupporterList } = await import("./crm/SupporterList");
const { InternshipManagement } = await import("./internships/InternshipManagement");
const { GroupEnquiryManagement } = await import("./volunteers/GroupEnquiryManagement");
const { VolunteerOverview } = await import("./volunteers/VolunteerOverview");
const { VolunteerPolicySettings } = await import("./volunteers/VolunteerPolicySettings");

function dashboard(section: AdminListSearch["section"]): ReactElement {
  return (
    <AdminDashboardContent
      section={section}
      search={{ section, q: "", archived: false, status: "all", page: 1 }}
      onSearchChange={() => {}}
    />
  );
}

type Destination = {
  /** The component the route renders for this navigation item. */
  page: () => ReactElement;
  /** A line of English the page shows once its data has answered with nothing. */
  shows: string;
};

const DESTINATIONS: Record<AdminNavItemId, Destination> = {
  "sponsorship-pledges": {
    page: () => <SponsorshipsContent />,
    shows: "Sponsorship payments and matching",
  },
  internships: {
    page: () => <InternshipManagement />,
    shows: "Veterinary student internship applications",
  },
  cat: { page: () => dashboard("cat"), shows: "Find and manage cat records" },
  dog: { page: () => dashboard("dog"), shows: "Find and manage dog records" },
  sponsor: {
    page: () => dashboard("sponsor"),
    shows: "Cats and dogs eligible for sponsorship",
  },
  applications: { page: () => <CaseList />, shows: "Adoption cases" },
  "coordinator-inbox": { page: () => <IntakeInbox />, shows: "Application inbox" },
  "coordinator-intake": { page: () => <ManualCaseIntake />, shows: "Manual intake" },
  "coordinator-tasks": { page: () => <TaskCenter />, shows: "Coordinator task centre" },
  "coordinator-adopters": { page: () => <AdopterList />, shows: "Adopters" },
  "coordinator-reports": { page: () => <CoordinatorReports />, shows: "Coordinator reports" },
  "coordinator-statuses": { page: () => <StatusAdmin />, shows: "Coordinator statuses" },
  volunteers: { page: () => <VolunteerOverview />, shows: "Volunteer operations overview" },
  // The policy page needs a full policy before it shows more than this line.
  "volunteer-settings": {
    page: () => <VolunteerPolicySettings />,
    shows: "Loading the volunteer policy",
  },
  "volunteer-group-enquiries": {
    page: () => <GroupEnquiryManagement />,
    shows: "Group enquiries",
  },
  payments: { page: () => dashboard("payments"), shows: "Payment records" },
  "payment-methods": {
    page: () => <PaymentMethodsManagement />,
    shows: "Payment method settings",
  },
  supporters: { page: () => <SupporterList />, shows: "Supporters" },
  content: { page: () => <ContentManagement />, shows: "Content source review queue" },
  "adoption-information": {
    page: () => <AdoptionInformationManagement />,
    shows: "Adoption information management",
  },
  knowledge: { page: () => <KnowledgeManagement />, shows: "Knowledge base" },
  governance: { page: () => <GovernanceManagement />, shows: "Team and governance" },
  faq: { page: () => <FaqManagement />, shows: "Topics searched with no answer" },
  // The page copies its data into a draft in an effect, which a static render never runs, so with
  // nothing to show it renders its load failure.
  "about-pages": {
    page: () => <AboutPagesManagement />,
    shows: "Could not load the page content",
  },
  "access-management": { page: () => <AccessManagement />, shows: "Access management" },
};

type Rendering = Record<QueryState, string>;
const renderings = new Map<AdminNavItemId, Rendering>();

/** The page of one navigation item in English, loading and with no data. Each is rendered once. */
function rendering(id: AdminNavItemId): Rendering {
  const known = renderings.get(id);
  if (known) return known;
  const render = (state: QueryState) => {
    queryState = state;
    try {
      return renderAdminInEnglish(DESTINATIONS[id].page());
    } finally {
      queryState = "loading";
    }
  };
  const created = { loading: render("loading"), empty: render("empty") };
  renderings.set(id, created);
  return created;
}

describe("every admin destination in English", () => {
  for (const item of ADMIN_NAV_ITEMS) {
    test(`${item.id} has no Chinese, loading or empty`, () => {
      expect(
        DESTINATIONS[item.id],
        `The navigation item "${item.id}" has no page here. Add it to DESTINATIONS.`,
      ).toBeDefined();
      const label = adminCopy.en.navItems[item.id];
      expect(label.length, `English navigation label of ${item.id}`).toBeGreaterThan(0);
      expectNoChineseText(label);

      const { loading, empty } = rendering(item.id);
      expect(loading.length, `${item.id} rendered nothing while loading`).toBeGreaterThan(0);
      expectNoChineseText(loading);
      expect(empty, `${item.id} should show its English page`).toContain(
        DESTINATIONS[item.id].shows,
      );
      expectNoChineseText(empty);
    });
  }

  test("renders one page for every navigation destination", () => {
    const ids = ADMIN_NAV_ITEMS.map((item) => item.id);
    expect(new Set(ids).size, "navigation ids are unique").toBe(ids.length);
    // Both directions: a nav item with no page here, and a page here for an item that is gone.
    expect(Object.keys(DESTINATIONS).sort()).toEqual([...ids].sort());
    for (const id of ids) rendering(id);
    expect(renderings.size).toBe(ADMIN_NAV_ITEMS.length);
  });
});
