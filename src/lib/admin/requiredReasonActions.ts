/**
 * Every admin action that must carry a reason (SP-5b-2). The ratchet guard
 * (`requiredReasonGuard.test.ts`) checks each action: its UI file marks the dialog or
 * field with `required-reason: <id>` and some test carries `// required-reason: <id>`.
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

export type RequiredReasonAction = {
  id: RequiredReasonId;
  kind: "dialog" | "inline";
  /** Paths under `src/components/admin/`. */
  ui: readonly string[];
  note?: string;
};

export const REQUIRED_REASON_ACTIONS: readonly RequiredReasonAction[] = [
  {
    id: "receipt.void",
    kind: "dialog",
    ui: ["donations/PaymentsReconcile.tsx", "crm/SupporterDetail.tsx"],
  },
  {
    id: "volunteer_registration.reject",
    kind: "dialog",
    ui: ["volunteers/VolunteerManagement.tsx", "volunteers/VolunteerRegistrationDetail.tsx"],
  },
  { id: "internship.reject", kind: "inline", ui: ["internships/InternshipManagement.tsx"] },
  { id: "faq.deactivate", kind: "dialog", ui: ["content/FaqManagement.tsx"] },
  { id: "estate.delete", kind: "dialog", ui: ["content/AdoptionInformationManagement.tsx"] },
  { id: "board_member.deactivate", kind: "dialog", ui: ["content/GovernanceManagement.tsx"] },
  { id: "coordinator_status.delete", kind: "dialog", ui: ["adoptions/StatusAdmin.tsx"] },
  { id: "document.delete", kind: "dialog", ui: ["content/DocumentManagement.tsx"] },
  { id: "annual_report.delete", kind: "dialog", ui: ["content/AnnualReportManagement.tsx"] },
  { id: "sponsorship_pledge.cancel", kind: "dialog", ui: ["sponsorship/PledgeDetailDrawer.tsx"] },
  { id: "sponsorship_proof.reject", kind: "dialog", ui: ["sponsorship/PledgeDetailDrawer.tsx"] },
  { id: "sponsorship_finance.adjust", kind: "inline", ui: ["sponsorship/FinancePanel.tsx"] },
  { id: "adoption_case.close", kind: "dialog", ui: ["adoptions/CaseDetail.tsx"] },
  {
    id: "volunteer_activity.bulk_cancel",
    kind: "inline",
    ui: ["volunteers/ActivityOperationForm.tsx"],
  },
];
