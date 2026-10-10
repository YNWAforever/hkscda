/**
 * Every admin action that must carry a reason (SP-5b-2). The ratchet guard
 * (`requiredReasonGuard.test.ts`) checks each action: its UI file marks the dialog or
 * field with `required-reason: <id>`, some test carries `// required-reason: <id>`, and no
 * file outside `ui`, `helpers` and `sentBy` sends a request to one of its `routes`.
 * A new action is added here, and the guard then requires its marker and its test.
 */
export type RequiredReasonId =
  | "receipt.void"
  | "volunteer_registration.reject"
  | "internship.reject"
  | "faq.deactivate"
  | "estate.delete"
  | "board_member.deactivate"
  | "coordinator_status.delete"
  | "document.delete"
  | "annual_report.delete"
  | "sponsorship_pledge.cancel"
  | "sponsorship_proof.reject"
  | "sponsorship_finance.adjust"
  | "adoption_case.close"
  | "volunteer_activity.bulk_cancel";

/**
 * A request the server checks the reason on. `path` is the API path with each path parameter
 * written `:name`; it matches a string or template literal in the source where every `${...}`
 * stands for one parameter segment.
 */
export type RequiredReasonRoute = {
  method: "POST" | "PATCH" | "DELETE";
  path: `/api/admin/${string}`;
};

export type RequiredReasonAction = {
  id: RequiredReasonId;
  kind: "dialog" | "inline";
  /** Paths under `src/components/admin/`. */
  ui: readonly string[];
  /** The mutating requests that carry the reason. */
  routes: readonly RequiredReasonRoute[];
  /**
   * Request helper modules (paths under `src/components/admin/`) that send a route for the UI.
   * Every non-test file that imports one must be in the `ui` of an action listing that helper.
   */
  helpers?: readonly string[];
  /**
   * Screens that send a route for an inline reason field kept in another file (the field's own
   * file is in `ui`). They may name the route; nothing else is checked about them.
   */
  sentBy?: readonly string[];
  note?: string;
};

export const REQUIRED_REASON_ACTIONS: readonly RequiredReasonAction[] = [
  {
    id: "receipt.void",
    kind: "dialog",
    ui: ["donations/PaymentsReconcile.tsx", "crm/SupporterDetail.tsx"],
    routes: [{ method: "POST", path: "/api/admin/receipts/:id/void" }],
    helpers: ["donations/receiptVoid.ts"],
  },
  {
    id: "volunteer_registration.reject",
    kind: "dialog",
    ui: ["volunteers/VolunteerManagement.tsx", "volunteers/VolunteerRegistrationDetail.tsx"],
    routes: [{ method: "PATCH", path: "/api/admin/volunteers/registrations/:id/status" }],
    helpers: ["volunteers/registrationStatusChange.ts"],
  },
  {
    id: "internship.reject",
    kind: "inline",
    ui: ["internships/InternshipManagement.tsx"],
    routes: [{ method: "POST", path: "/api/admin/internships" }],
  },
  {
    id: "faq.deactivate",
    kind: "dialog",
    ui: ["content/FaqManagement.tsx"],
    routes: [{ method: "DELETE", path: "/api/admin/faq" }],
    helpers: ["content/faqDeactivate.ts"],
  },
  {
    id: "estate.delete",
    kind: "dialog",
    ui: ["content/AdoptionInformationManagement.tsx"],
    routes: [{ method: "DELETE", path: "/api/admin/adoption-information" }],
    helpers: ["content/estateDelete.ts"],
  },
  {
    id: "board_member.deactivate",
    kind: "dialog",
    ui: ["content/GovernanceManagement.tsx"],
    routes: [{ method: "DELETE", path: "/api/admin/governance" }],
    helpers: ["content/governanceDeactivate.ts"],
  },
  {
    id: "coordinator_status.delete",
    kind: "dialog",
    ui: ["adoptions/StatusAdmin.tsx"],
    routes: [{ method: "DELETE", path: "/api/admin/adoptions/statuses/:id" }],
    helpers: ["adoptions/statusDelete.ts"],
  },
  {
    id: "document.delete",
    kind: "dialog",
    ui: ["content/DocumentManagement.tsx"],
    routes: [{ method: "DELETE", path: "/api/admin/documents/:id" }],
    helpers: ["content/documentDelete.ts"],
  },
  {
    id: "annual_report.delete",
    kind: "dialog",
    ui: ["content/AnnualReportManagement.tsx"],
    routes: [{ method: "DELETE", path: "/api/admin/annual-reports/:id" }],
    helpers: ["content/documentDelete.ts"],
  },
  {
    id: "sponsorship_pledge.cancel",
    kind: "dialog",
    ui: ["sponsorship/PledgeDetailDrawer.tsx"],
    routes: [{ method: "POST", path: "/api/admin/sponsorships/pledges/:id/cancel" }],
    helpers: ["sponsorship/pledgeDecision.ts"],
  },
  {
    id: "sponsorship_proof.reject",
    kind: "dialog",
    ui: ["sponsorship/PledgeDetailDrawer.tsx"],
    routes: [{ method: "POST", path: "/api/admin/sponsorships/pledges/:id/review" }],
    helpers: ["sponsorship/pledgeDecision.ts"],
  },
  {
    id: "sponsorship_finance.adjust",
    kind: "inline",
    ui: ["sponsorship/FinancePanel.tsx"],
    routes: [{ method: "POST", path: "/api/admin/sponsorships/pledges/:id/finance" }],
  },
  {
    id: "adoption_case.close",
    kind: "dialog",
    ui: ["adoptions/CaseDetail.tsx"],
    routes: [{ method: "POST", path: "/api/admin/adoptions/cases/:id/status" }],
    helpers: ["adoptions/caseStatusChange.ts"],
  },
  {
    id: "volunteer_activity.bulk_cancel",
    kind: "inline",
    ui: ["volunteers/ActivityOperationForm.tsx"],
    routes: [{ method: "POST", path: "/api/admin/volunteers/bulk" }],
    sentBy: ["volunteers/VolunteerActivityWorkspace.tsx"],
  },
];
