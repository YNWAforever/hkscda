import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { AdminLanguageProvider } from "../../components/admin/adminI18n";
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

  test("announces safe form errors", () => {
    const markup = render("ready", "暫時未能更新密碼，請稍後再試。");
    expect(markup).toContain('role="alert"');
    expect(markup).not.toContain("AuthApiError");
  });
});
