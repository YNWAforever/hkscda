import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { SupporterSummary } from "../../../lib/crm/types";

const supporter: SupporterSummary = {
  id: "supporter-1",
  name: "Ada Wong",
  email: "ada@example.com",
  phone: "9123 4567",
  language: "en",
  tags: ["demo"],
  roles: ["adopter"],
  deletedAt: null,
  lastGiftAt: null,
  lastGiftAmountCents: null,
  lifetimeAmountCents: 0,
  donationCount: 0,
  receiptNeeded: false,
  emailConsent: "opt_in",
  whatsappConsent: null,
};

mock.module("@tanstack/react-query", () => ({
  useQuery: () => ({
    data: { supporters: [supporter], total: 1 },
    error: null,
    isLoading: false,
  }),
}));

mock.module("@tanstack/react-router", () => ({
  Link: ({
    children,
    className,
    params,
    to,
  }: {
    children: React.ReactNode;
    className?: string;
    params?: { id?: string };
    to: string;
  }) => (
    <a className={className} href={to.replace("$id", params?.id ?? "")}>
      {children}
    </a>
  ),
}));

mock.module("../adminPageCopy", () => ({
  formatAdminDateTime: (value: string | null | undefined) => value ?? "-",
  formatAdminNumber: (value: number | null | undefined) => String(value ?? 0),
  useAdminPageCopy: () => ({
    language: "en",
    pageCopy: {
      common: {
        open: "Open",
        supportersCsv: "Supporters CSV",
        totalSupporters: (count: number) => `${count} supporters`,
      },
      supporters: {
        title: "Supporters",
        subtitle: "Donor records.",
        searchLabel: "Search supporters",
        searchPlaceholder: "Search",
        roleFilterLabel: "Filter by role",
        allRoles: "All roles",
        loadError: "Could not load supporters",
        empty: "No supporters found",
        newSupporter: "New supporter",
        needsReview: "Needs review",
        clear: "Clear",
        lastGift: "Last gift",
        receipts: "Receipts",
        email: "Email",
        whatsapp: "WhatsApp",
        roleLabels: {
          donor: "Donor",
          adopter: "Adopter",
          volunteer: "Volunteer",
          foster: "Foster",
        },
        columns: {
          supporter: "Supporter",
          roles: "Roles",
          consent: "Consent",
          lifetime: "Lifetime",
          lastGift: "Last gift",
          receipts: "Receipts",
        },
      },
    },
  }),
}));

mock.module("./ExportBar", () => ({
  ExportBar: () => <span>export</span>,
}));

mock.module("./SupporterFormDialog", () => ({
  SupporterFormDialog: () => <span>new supporter</span>,
}));

const { SupporterList } = await import("./SupporterList");

describe("SupporterList", () => {
  test("renders an explicit open action for supporter details", () => {
    const markup = renderToStaticMarkup(<SupporterList />);

    expect(markup).toContain("Open");
    expect(markup).toContain('href="/admin/supporters/supporter-1"');
  });
});
