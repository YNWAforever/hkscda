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

  test("renders exactly one h1 naming the sign-in page", () => {
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider>
        <AdminLoginContent passwordResetSuccess={false} onSignedIn={() => {}} />
      </AdminLanguageProvider>,
    );
    expect((markup.match(/<h1[\s>]/g) ?? []).length).toBe(1);
    expect(markup).toMatch(/<h1[^>]*>[^<]*管理後台登入[^<]*<\/h1>/);
    // styles.css gives every heading bold weight and tight tracking; the subtitle
    // was a normal-weight line, so the h1 must opt back out.
    expect(markup).toMatch(/<h1[^>]*class="[^"]*\bfont-normal\b/);
    expect(markup).toMatch(/<h1[^>]*class="[^"]*\btracking-normal\b/);
    // AdminLanguageProvider always starts in zh, so the English heading is
    // checked through the copy table that the h1 renders from.
    expect(adminCopy.en.login.subtitle).toBe("Admin sign in");
    expect(adminCopy.en.login.resetTitle).toBe("Reset password");
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
