import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const caseListModule = await import("./CaseList");
const caseDetailModule = await import("./CaseDetail");
const { CaseListStatusFilterError } = caseListModule as typeof caseListModule & {
  CaseListStatusFilterError?: (props: { message: string }) => JSX.Element;
};
const { CaseDetailStatusesError } = caseDetailModule as typeof caseDetailModule & {
  CaseDetailStatusesError?: (props: { message: string }) => JSX.Element;
};

describe("adoption async error announcements", () => {
  test("announces case list status filter load errors", () => {
    expect(typeof CaseListStatusFilterError).toBe("function");

    const markup = renderToStaticMarkup(
      CaseListStatusFilterError ? (
        <CaseListStatusFilterError message="Statuses unavailable" />
      ) : (
        <div />
      ),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Statuses unavailable");
  });

  test("announces case detail status load errors", () => {
    expect(typeof CaseDetailStatusesError).toBe("function");

    const markup = renderToStaticMarkup(
      CaseDetailStatusesError ? (
        <CaseDetailStatusesError message="Status options unavailable" />
      ) : (
        <div />
      ),
    );

    expect(markup).toContain('role="alert"');
    expect(markup).toContain("Status options unavailable");
  });
});
