import { describe, expect, mock, test } from "bun:test";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

const realReactRouter = await import("@tanstack/react-router");
const realReactQuery = await import("@tanstack/react-query");
const realAdminPageCopy = await import("../adminPageCopy");

// mock.module patches the shared module registry for the whole process, not
// just this file, so the language is pinned here explicitly rather than left
// to whatever AdminLanguageProvider default happens to be live relative to
// other test files' mocks.
mock.module("../adminPageCopy", () => ({
  ...realAdminPageCopy,
  useAdminPageCopy: () => ({ language: "zh", pageCopy: realAdminPageCopy.adminPageCopy.zh }),
}));

type MockLinkProps = {
  children: ReactNode;
  className?: string;
  params?: Record<string, string>;
  to: string;
};

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children, className, params, to }: MockLinkProps) => {
    const href = params
      ? Object.entries(params).reduce((path, [key, value]) => path.replace(`$${key}`, value), to)
      : to;
    return (
      <a data-router-link="true" href={href} className={className}>
        {children}
      </a>
    );
  },
}));

let intakeError: Error | null = null;

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useQuery: () => ({
    data: intakeError ? undefined : { items: [] },
    error: intakeError,
    isLoading: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

const { IntakeInbox } = await import("./IntakeInbox");

const render = () => renderToStaticMarkup(<IntakeInbox />);

describe("IntakeInbox", () => {
  test("renders the inbox", () => {
    expect(render()).toContain("申請收件箱");
  });

  test("shows a retry instead of a false empty state when the query fails", () => {
    // The old ad-hoc alert appended the raw error.message, and separately the
    // items.length === 0 branch still rendered "沒有符合篩選的收件箱項目"
    // right below it -- a failure asserted as a confirmed empty inbox.
    intakeError = new Error("boom");
    const markup = render();
    expect(markup).toContain("無法載入收件箱");
    expect(markup).not.toContain("沒有符合篩選的收件箱項目");
    expect(markup).not.toContain("boom");
    intakeError = null;
  });
});
