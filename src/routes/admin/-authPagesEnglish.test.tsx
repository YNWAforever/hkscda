import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, mock, test } from "bun:test";

import {
  expectNoChineseText,
  renderAdminInChinese,
  renderAdminInEnglish,
} from "../../components/admin/i18n/testing";

const realRouter = await import("@tanstack/react-router");

let search: { passwordReset?: "success" } = {};

// Both pages read the router: the login page its search string, both a navigate function.
mock.module("@tanstack/react-router", () => ({
  ...realRouter,
  createFileRoute: () => (options: Record<string, unknown>) => ({
    ...options,
    useSearch: () => search,
  }),
  useNavigate: () => async () => {},
  useRouter: () => ({ history: { push: () => {} } }),
}));

const { AdminLoginPage } = await import("./login");
const { AdminResetPasswordForm, AdminResetPasswordPage } = await import("./reset-password");

// The login page reads the query cache to find the signed-in admin after sign-in.
function LoginPage() {
  return (
    <QueryClientProvider client={new QueryClient()}>
      <AdminLoginPage />
    </QueryClientProvider>
  );
}

// The language toggle names each language in its own language, so it keeps this one word.
const TOGGLE_WORD = "中文";

describe("/admin/login as a whole page", () => {
  test("is in English without Chinese, apart from the language toggle", () => {
    search = {};
    const markup = renderAdminInEnglish(<LoginPage />);
    expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
    for (const text of [
      "Admin sign in",
      "Email",
      "Password",
      "Forgot password?",
      ">Sign in<",
      "English",
    ]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toMatch(/<main[^>]*lang="en"/);
    expect(markup).not.toContain('lang="zh-HK"');
  });

  test("shows the password updated message in English after a reset", () => {
    search = { passwordReset: "success" };
    const markup = renderAdminInEnglish(<LoginPage />);
    expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
    expect(markup).toContain("Your password has been updated. Sign in with your new password.");
  });

  test("is unchanged in Chinese", () => {
    search = {};
    const markup = renderAdminInChinese(<LoginPage />);
    for (const text of ["管理後台登入", "電郵", "密碼", "忘記密碼？", ">登入<"]) {
      expect(markup, text).toContain(text);
    }
    expect(markup).toMatch(/<main[^>]*lang="zh-HK"/);
  });
});

describe("/admin/reset-password as a whole page", () => {
  test("is in English without Chinese, apart from the language toggle", () => {
    const markup = renderAdminInEnglish(<AdminResetPasswordPage />);
    expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
    expect(markup).toMatch(/<h1[^>]*>Reset password<\/h1>/);
    expect(markup).toContain("Loading...");
    expect(markup).toMatch(/<main[^>]*lang="en"/);
  });

  test("is unchanged in Chinese", () => {
    const markup = renderAdminInChinese(<AdminResetPasswordPage />);
    expect(markup).toMatch(/<h1[^>]*>重設密碼<\/h1>/);
    expect(markup).toContain("載入中...");
    expect(markup).toMatch(/<main[^>]*lang="zh-HK"/);
  });

  test("shows every recovery state and every form error in English", () => {
    const errors = [
      null,
      "Password must be at least 8 characters.",
      "The passwords do not match.",
      "We could not update your password. Please try again later.",
    ];
    for (const status of ["checking", "ready", "invalid"] as const) {
      for (const error of errors) {
        for (const loading of [false, true]) {
          const markup = renderAdminInEnglish(
            <AdminResetPasswordForm
              status={status}
              loading={loading}
              error={error}
              onSubmit={() => {}}
              onBack={() => {}}
            />,
          );
          expectNoChineseText(markup, { allow: [TOGGLE_WORD] });
        }
      }
    }
    const invalid = renderAdminInEnglish(
      <AdminResetPasswordForm
        status="invalid"
        loading={false}
        error={null}
        onSubmit={() => {}}
        onBack={() => {}}
      />,
    );
    expect(invalid).toContain(
      "This reset link is invalid or has expired. Please request a new one.",
    );
    expect(invalid).toContain("Back to sign in");
  });
});
