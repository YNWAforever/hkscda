import { afterAll, describe, expect, mock, test } from "bun:test";
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

let supportersError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: () => ({
    data: supportersError ? undefined : { supporters: [supporter], total: 1 },
    error: supportersError,
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

// bun's mock.module patches the shared module registry for the rest of the
// process, not just this file -- without restoring it, every other test file
// that imports "../adminPageCopy" after this one (via any relative path
// resolving to the same module) would silently get this hardcoded English
// stub instead of the real, language-aware hook.
afterAll(() => {
  mock.module("../adminPageCopy", () => realAdminPageCopy);
});

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

  test("does not claim there are no supporters underneath the load-error banner", () => {
    // DataTable's empty prop rendered unconditionally, so a failed fetch
    // showed "Could not load supporters" directly above "No supporters found"
    // -- the same screen asserting both a failure and a confirmed empty result.
    supportersError = new Error("boom");
    const markup = renderToStaticMarkup(<SupporterList />);
    expect(markup).toContain("Could not load supporters");
    expect(markup).not.toContain("No supporters found");
    supportersError = null;
  });
});
