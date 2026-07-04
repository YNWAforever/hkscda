import { describe, expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import type { SupporterSummary } from "../../../lib/crm/types";

const realReactQuery = await import("@tanstack/react-query");
const realReactRouter = await import("@tanstack/react-router");
const realAdminPageCopy = await import("../adminPageCopy");

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
  ...realReactQuery,
  useQuery: () => ({
    data: { supporters: [supporter], total: 1 },
    error: null,
    isLoading: false,
  }),
}));

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
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
  ...realAdminPageCopy,
  useAdminPageCopy: () => ({
    language: "en",
    pageCopy: realAdminPageCopy.adminPageCopy.en,
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
