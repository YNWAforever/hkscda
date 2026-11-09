import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminLanguageProvider } from "../../components/admin/adminI18n";
import { renderAdminInEnglish } from "../../components/admin/i18n/testing";
import { AdminResetPasswordForm } from "./reset-password";

function render(status: "checking" | "ready" | "invalid", error: string | null = null) {
  return renderToStaticMarkup(
    <AdminLanguageProvider>
      <AdminResetPasswordForm
        status={status}
        loading={false}
        error={error}
        onSubmit={() => {}}
        onBack={() => {}}
      />
    </AdminLanguageProvider>,
  );
}

describe("AdminResetPasswordForm", () => {
  test("shows a loading state while the recovery session is restored", () => {
    expect(render("checking")).toContain("載入中");
  });

  test("shows password and confirmation fields for a valid session", () => {
    const markup = render("ready");
    expect(markup).toContain("新密碼");
    expect(markup).toContain("確認新密碼");
    expect(markup.match(/type="password"/g)?.length).toBe(2);
  });

  test("shows an invalid-link message and a return action", () => {
    const markup = render("invalid");
    expect(markup).toContain("重設連結無效或已過期");
    expect(markup).toContain("返回登入");
  });

  test("renders exactly one h1 naming the page, whatever the recovery status", () => {
    for (const status of ["checking", "ready", "invalid"] as const) {
      const markup = render(status);
      expect((markup.match(/<h1[\s>]/g) ?? []).length).toBe(1);
      expect(markup).toMatch(/<h1[^>]*>[^<]*重設密碼[^<]*<\/h1>/);
      // The subtitle was a normal-weight line; styles.css makes headings bold.
      expect(markup).toMatch(/<h1[^>]*class="[^"]*\bfont-normal\b/);
      expect(markup).toMatch(/<h1[^>]*class="[^"]*\btracking-normal\b/);
    }
  });

  test("announces safe form errors", () => {
    const markup = render("ready", "暫時未能更新密碼，請稍後再試。");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("AuthApiError");
  });

  test("declares the language of the page it shows", () => {
    expect(render("ready")).toMatch(/<main[^>]*lang="zh-HK"/);

    const english = renderAdminInEnglish(
      <AdminResetPasswordForm
        status="ready"
        loading={false}
        error={null}
        onSubmit={() => {}}
        onBack={() => {}}
      />,
    );
    expect(english).toMatch(/<main[^>]*lang="en"/);
    expect(english).not.toContain('lang="zh-HK"');
  });

  // BUG-25: an invite link lands on this page with ?intent=invite and must say "set password".
  test("shows invite wording for an invited admin, not reset wording", () => {
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider>
        <AdminResetPasswordForm
          status="ready"
          intent="invite"
          loading={false}
          error={null}
          onSubmit={() => {}}
          onBack={() => {}}
        />
      </AdminLanguageProvider>,
    );
    expect(markup).toContain("設定密碼");
    expect(markup).toContain("為你的管理後台帳戶設定密碼");
    expect(markup).not.toContain("重設密碼");
    expect(markup).not.toContain("更新密碼");
  });

  test("shows the invite link failure, not the reset failure, for an invalid invite", () => {
    const markup = renderToStaticMarkup(
      <AdminLanguageProvider>
        <AdminResetPasswordForm
          status="invalid"
          intent="invite"
          loading={false}
          error={null}
          onSubmit={() => {}}
          onBack={() => {}}
        />
      </AdminLanguageProvider>,
    );
    expect(markup).toContain("邀請連結無效或已過期");
    expect(markup).not.toContain("重設連結無效");
  });

  test("renders the invite wording in English too", () => {
    const english = renderAdminInEnglish(
      <AdminResetPasswordForm
        status="ready"
        intent="invite"
        loading={false}
        error={null}
        onSubmit={() => {}}
        onBack={() => {}}
      />,
    );
    expect(english).toContain("Set your password");
    expect(english).toContain("Set a password for your admin account");
    expect(english).not.toContain("Reset password");
  });
});
