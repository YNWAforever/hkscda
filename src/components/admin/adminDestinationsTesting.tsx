import { mock } from "bun:test";
import * as realQuery from "@tanstack/react-query";
import * as realRouter from "@tanstack/react-router";
import type { ReactElement, ReactNode } from "react";

import { ADMIN_IDENTITY_QUERY_KEY } from "../../lib/admin/identity";
import type { AdminListSearch } from "../../lib/animals/adminListState";
import type { AdminNavItemId } from "./adminNav";
import type { VolunteerWorkspacePageId } from "./volunteerWorkspaceCopy";

/**
 * The pages behind the admin destinations, rendered without their layout, for the tests that
 * check every destination at once (`adminEnglishSmoke.test.tsx`, `adminHeadingGuard.test.tsx`).
 *
 * Importing this module installs the router and query mocks, so import it before anything that
 * renders a page. Every query answers one of three ways, set with `withQueryState`: still
 * loading, answered with nothing, or failed. The signed-in admin is always known,
 * so a page that waits for it shows its real content.
 */

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

/**
 * What every `useQuery` answers. `loading` is a request that has not come back, `empty` is one
 * that came back with nothing, `error` is one that failed.
 */
export type QueryState = "loading" | "empty" | "error";
let queryState: QueryState = "loading";

/** Runs `render` with every query answering `state`, then puts the answer back to loading. */
export function withQueryState<T>(state: QueryState, render: () => T): T {
  queryState = state;
  try {
    return render();
  } finally {
    queryState = "loading";
  }
}

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
    if (String(queryKey[0]) === String(ADMIN_IDENTITY_QUERY_KEY[0])) {
      return {
        data: {
          admin: { id: "admin-1", email: "admin@example.test", role: "admin", status: "active" },
        },
        isSuccess: true,
      };
    }
    return {
      data: undefined,
      error: queryState === "error" ? new Error("The request failed") : null,
      isError: queryState === "error",
      isLoading: queryState === "loading",
      isPending: queryState === "loading",
      isFetching: false,
      isSuccess: false,
      isPlaceholderData: false,
      refetch() {},
    };
  },
}));

export type Destination = {
  /** The component the route renders for this navigation item. */
  page: () => ReactElement;
  /** A line of English the page shows once its data has answered with nothing. */
  shows: string;
};

/**
 * A record page: what it shows before its record is there. `nav` is the navigation item (or
 * `label`, the workspace page) whose words are the page's `h1` until the record loads.
 */
export type RecordPage = {
  /** The page when every query is in `state`; the animal edit page takes its state as props. */
  page: (state: QueryState) => ReactElement;
  /** The navigation item the page sits under. */
  nav?: AdminNavItemId;
  /** The destination label, when that is a volunteer workspace page rather than a navigation item. */
  workspacePage?: VolunteerWorkspacePageId;
};

/**
 * Loads the pages after the mocks above are in place. A module that other modules import cannot
 * use top-level await here (`bun test --isolate` does not wait for it), so the test awaits this.
 */
export async function loadDestinations() {
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
  const { TaskOverviewPage } = await import("./operations/TaskOverview");

  const { CaseDetail } = await import("./adoptions/CaseDetail");
  const { AdopterDetail } = await import("./adoptions/AdopterDetail");
  const { SupporterDetail } = await import("./crm/SupporterDetail");
  const { ContentEditor } = await import("./content/ContentEditor");
  const { EditAnimalContent } = await import("../../routes/admin/animals/$id.edit");
  const { VolunteerRegistrationDetail } = await import("./volunteers/VolunteerRegistrationDetail");
  const { VolunteerPersonDetail } = await import("./volunteers/VolunteerPersonDetail");
  const { VolunteerActivityWorkspace } = await import("./volunteers/VolunteerActivityWorkspace");
  const { VolunteerCalendar } = await import("./volunteers/VolunteerCalendar");
  const { VolunteerTasks } = await import("./volunteers/VolunteerTasks");
  const { VolunteerOperations } = await import("./volunteers/VolunteerOperations");
  const { VolunteerQualifications } = await import("./volunteers/VolunteerQualifications");
  const { VolunteerDailySettings } = await import("./volunteers/VolunteerDailySettings");
  const { VolunteerAssessments } = await import("./volunteers/VolunteerAssessments");
  const { VolunteerPolicySources } = await import("./volunteers/VolunteerPolicySources");
  const { VolunteerPolicySimulation } = await import("./volunteers/VolunteerPolicySimulation");
  const { VolunteerDirectory } = await import("./volunteers/VolunteerDirectory");
  const { VolunteerWorkspaceFrame } = await import("./VolunteerAdminShell");

  function dashboard(section: AdminListSearch["section"]): ReactElement {
    return (
      <AdminDashboardContent
        section={section}
        search={{ section, q: "", archived: false, status: "all", page: 1 }}
        onSearchChange={() => {}}
      />
    );
  }

  const DESTINATIONS: Record<AdminNavItemId, Destination> = {
    "sponsorship-pledges": {
      page: () => <SponsorshipsContent />,
      shows: "Sponsorship payments and matching",
    },
    internships: {
      page: () => <InternshipManagement />,
      shows: "These applications are separate from volunteer tiers and session places.",
    },
    cat: { page: () => dashboard("cat"), shows: "Find and manage cat records" },
    dog: { page: () => dashboard("dog"), shows: "Find and manage dog records" },
    sponsor: {
      page: () => dashboard("sponsor"),
      shows: "Cats and dogs eligible for sponsorship",
    },
    applications: {
      page: () => <CaseList />,
      shows: "Coordinator queue, matching, follow-up and finalisation.",
    },
    "coordinator-inbox": {
      page: () => <IntakeInbox />,
      shows: "Review public adoption applications, photos and visit follow-ups.",
    },
    "coordinator-intake": { page: () => <ManualCaseIntake />, shows: "Manual intake" },
    "coordinator-tasks": {
      page: () => <TaskCenter />,
      shows: "View, filter and update follow-up work across adoption cases and animals.",
    },
    "coordinator-adopters": { page: () => <AdopterList />, shows: "Adopters" },
    "coordinator-reports": {
      page: () => <CoordinatorReports />,
      shows: "Monthly intake summary and regenerated CSV export history.",
    },
    "coordinator-statuses": { page: () => <StatusAdmin />, shows: "New status" },
    volunteers: {
      page: () => <VolunteerOverview />,
      shows: "Start from what needs doing, then follow each volunteer, session and service record.",
    },
    // The policy page needs a full policy before it shows more than this line.
    "volunteer-settings": {
      page: () => <VolunteerPolicySettings />,
      shows: "Loading the volunteer policy",
    },
    "volunteer-group-enquiries": {
      page: () => <GroupEnquiryManagement />,
      shows: "Group enquiries",
    },
    payments: { page: () => dashboard("payments"), shows: "Payments" },
    "payment-methods": {
      page: () => <PaymentMethodsManagement />,
      shows: "Payment method settings",
    },
    supporters: { page: () => <SupporterList />, shows: "Supporters" },
    content: { page: () => <ContentManagement />, shows: "Content source review queue" },
    "adoption-information": {
      page: () => <AdoptionInformationManagement />,
      shows: "Manage the public adoption fees and the reference list of dog-friendly estates.",
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

  /**
   * Pages the layout links to outside `ADMIN_NAV_ITEMS`. The task overview (`/admin/tasks`) is the
   * fixed link at the top of the navigation in `AdminLayout`. These are rendered the same way, but
   * they are not navigation items, so the count check below leaves them out.
   */
  const EXTRA_DESTINATIONS: Record<"task-overview", Destination> = {
    "task-overview": { page: () => <TaskOverviewPage />, shows: "Suggested first steps" },
  };

  const RECORD_PAGES: Record<string, RecordPage> = {
    "applications/$id": { page: () => <CaseDetail caseId="case-1" />, nav: "applications" },
    "coordinator/adopters/$id": {
      page: () => <AdopterDetail adopterId="adopter-1" />,
      nav: "coordinator-adopters",
    },
    "supporters/$id": {
      page: () => <SupporterDetail supporterId="supporter-1" />,
      nav: "supporters",
    },
    "content/$id": { page: () => <ContentEditor contentId="content-1" />, nav: "content" },
    "animals/$id/edit": {
      page: (state) => (
        <EditAnimalContent
          animal={undefined}
          isLoading={state === "loading"}
          error={state === "error" ? new Error("The request failed") : null}
          onRetry={() => {}}
        />
      ),
      nav: "cat",
    },
    "volunteers/registrations/$id": {
      page: () => <VolunteerRegistrationDetail registrationId="registration-1" />,
      workspacePage: "activities",
    },
  };

  /**
   * Every page of the volunteer workspace inside the workspace frame, the way its route renders it:
   * only the directory and the person page ask the frame for a heading, so only they get one from it.
   */
  const VOLUNTEER_PAGES: Record<VolunteerWorkspacePageId | "person", () => ReactElement> = {
    overview: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerOverview />
      </VolunteerWorkspaceFrame>
    ),
    people: () => (
      <VolunteerWorkspaceFrame intro="people">
        <VolunteerDirectory search={{ page: 1 }} />
      </VolunteerWorkspaceFrame>
    ),
    person: () => (
      <VolunteerWorkspaceFrame intro="person">
        <VolunteerPersonDetail profileId="profile-1" search={{ page: 1 }} />
      </VolunteerWorkspaceFrame>
    ),
    activities: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerActivityWorkspace />
      </VolunteerWorkspaceFrame>
    ),
    calendar: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerCalendar />
      </VolunteerWorkspaceFrame>
    ),
    tasks: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerTasks />
      </VolunteerWorkspaceFrame>
    ),
    "group-enquiries": () => (
      <VolunteerWorkspaceFrame>
        <GroupEnquiryManagement />
      </VolunteerWorkspaceFrame>
    ),
    operations: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerOperations />
      </VolunteerWorkspaceFrame>
    ),
    qualifications: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerQualifications />
      </VolunteerWorkspaceFrame>
    ),
    settings: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerPolicySettings />
      </VolunteerWorkspaceFrame>
    ),
    "daily-settings": () => (
      <VolunteerWorkspaceFrame>
        <VolunteerDailySettings />
      </VolunteerWorkspaceFrame>
    ),
    assessments: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerAssessments />
      </VolunteerWorkspaceFrame>
    ),
    sources: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerPolicySources />
      </VolunteerWorkspaceFrame>
    ),
    simulation: () => (
      <VolunteerWorkspaceFrame>
        <VolunteerPolicySimulation />
      </VolunteerWorkspaceFrame>
    ),
  };

  /** The five tabs of the adoption information page, each of which draws a different editor. */
  const ADOPTION_TABS: Record<
    "fees" | "page" | "estates" | "rules" | "careTopics",
    () => ReactElement
  > = {
    fees: () => <AdoptionInformationManagement initialTab="fees" />,
    page: () => <AdoptionInformationManagement initialTab="page" />,
    estates: () => <AdoptionInformationManagement initialTab="estates" />,
    rules: () => <AdoptionInformationManagement initialTab="rules" />,
    careTopics: () => <AdoptionInformationManagement initialTab="careTopics" />,
  };

  return { DESTINATIONS, EXTRA_DESTINATIONS, RECORD_PAGES, VOLUNTEER_PAGES, ADOPTION_TABS };
}
