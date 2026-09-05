import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminLanguageProvider, adminCopy } from "../../components/admin/adminI18n";
import { AdminLoginContent } from "./login";

describe("AdminLoginContent", () => {
  test("offers password recovery from the sign-in form", () => {
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider>
        <AdminLoginContent passwordResetSuccess={false} onSignedIn={() => {}} />
      </AdminLanguageProvider>,
    );
    expect(markup).toContain("忘記密碼？");
    expect(markup).toContain('type="password"');
    expect(markup).toMatch(/<button[^>]*type="submit"[^>]*disabled=""/);
  });

  test("contains complete English recovery copy", () => {
    expect(adminCopy.en.login.forgotPassword).toBe("Forgot password?");
    expect(adminCopy.en.login.resetSent).toContain("If an account exists");
    expect(adminCopy.zh.login.forgotPassword).toBe("忘記密碼？");
  });

  test("shows the completed-reset message when redirected from recovery", () => {
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider>
        <AdminLoginContent passwordResetSuccess onSignedIn={() => {}} />
      </AdminLanguageProvider>,
    );
    expect(markup).toContain("密碼已更新");
  });
});
