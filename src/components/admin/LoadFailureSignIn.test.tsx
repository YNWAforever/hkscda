import { describe, expect, mock, test } from "bun:test";

import { AdminSessionError } from "../../lib/admin/session";
import { renderAdminInEnglish } from "./i18n/testing";

const realRouter = await import("@tanstack/react-router");

let location = { pathname: "/admin/cases/abc", searchStr: "?tab=notes" };

// LoadFailure asks the router where the user is, so the sign-in link can bring them back.
mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  useRouter: () => ({ state: { location }, history: { push: () => {} } }),
}));

const { LoadFailure } = await import("./LoadFailure");

describe("LoadFailure session link inside a router", () => {
  test("carries the current page and search as the sign-in redirect", () => {
    const markup = renderAdminInEnglish(
      <LoadFailure error={new AdminSessionError("not_signed_in")} onRetry={() => {}} />,
    );
    expect(markup).toContain('href="/admin/login?redirect=%2Fadmin%2Fcases%2Fabc%3Ftab%3Dnotes"');
  });

  test("is plain sign-in when the current page is not a safe destination", () => {
    location = { pathname: "/admin/login", searchStr: "" };
    const markup = renderAdminInEnglish(
      <LoadFailure error={new AdminSessionError("not_signed_in")} onRetry={() => {}} />,
    );
    expect(markup).toContain('href="/admin/login"');
    expect(markup).not.toContain("redirect=");
  });
});
