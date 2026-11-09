import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  AdminLanguageProvider,
  AdminLanguageToggle,
  useAdminLanguage,
} from "../../components/admin/adminI18n";
import { adminLanguageTag } from "../../components/admin/i18n/pageLanguage";
import {
  completeAdminPasswordReset,
  parseAdminSetPasswordIntent,
  type AdminSetPasswordIntent,
  type PasswordRecoveryFailure,
} from "../../lib/admin/passwordRecovery";
import { getAdminAuthClient } from "../../lib/admin/adminAuthClient";

export type RecoveryStatus = "checking" | "ready" | "invalid";

export const Route = createFileRoute("/admin/reset-password")({
  // BUG-25: the invite link lands here with ?intent=invite so the page can say "set your
  // password" rather than "reset your password". Supabase appends the session hash after it.
  validateSearch: (search: Record<string, unknown>) => ({
    intent: search.intent === "invite" ? ("invite" as const) : undefined,
  }),
  component: AdminResetPasswordPage,
});

export function AdminResetPasswordPage() {
  const navigate = useNavigate();
  const { intent: rawIntent } = Route.useSearch();

  return (
    <AdminLanguageProvider>
      <AdminResetPasswordController
        intent={parseAdminSetPasswordIntent(rawIntent)}
        onComplete={() => navigate({ to: "/admin/login", search: { passwordReset: "success" } })}
        onBack={() => navigate({ to: "/admin/login", search: {} })}
      />
    </AdminLanguageProvider>
  );
}

function AdminResetPasswordController({
  intent,
  onComplete,
  onBack,
}: {
  intent: AdminSetPasswordIntent;
  onComplete: () => void | Promise<void>;
  onBack: () => void;
}) {
  const [status, setStatus] = useState<RecoveryStatus>("checking");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { copy } = useAdminLanguage();

  useEffect(() => {
    let active = true;
    let recoverySeen = false;
    const auth = getAdminAuthClient().auth;
    const {
      data: { subscription },
    } = auth.onAuthStateChange((event, session) => {
      if (!active || !session) return;
      // A recovery link fires PASSWORD_RECOVERY; an invite link fires SIGNED_IN (BUG-25).
      if (event !== "PASSWORD_RECOVERY" && !(intent === "invite" && event === "SIGNED_IN")) return;
      recoverySeen = true;
      setStatus("ready");
    });

    void auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || recoverySeen) return;
      setStatus(!sessionError && data.session ? "ready" : "invalid");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [intent]);

  function getFailureMessage(reason: PasswordRecoveryFailure) {
    if (reason === "too_short") return copy.login.passwordTooShort;
    if (reason === "mismatch") return copy.login.passwordMismatch;
    return copy.login.updateError;
  }

  async function handleSubmit(password: string, confirmation: string) {
    setLoading(true);
    setError(null);
    const result = await completeAdminPasswordReset({
      auth: getAdminAuthClient().auth,
      password,
      confirmation,
    });
    setLoading(false);

    if (!result.ok) {
      setError(getFailureMessage(result.reason));
      return;
    }

    await onComplete();
  }

  return (
    <AdminResetPasswordForm
      status={status}
      intent={intent}
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      onBack={onBack}
    />
  );
}

export interface AdminResetPasswordFormProps {
  status: RecoveryStatus;
  intent?: AdminSetPasswordIntent;
  loading: boolean;
  error: string | null;
  onSubmit: (password: string, confirmation: string) => void | Promise<void>;
  onBack: () => void;
}

export function AdminResetPasswordForm({
  status,
  intent = "recovery",
  loading,
  error,
  onSubmit,
  onBack,
}: AdminResetPasswordFormProps) {
  const { copy, language } = useAdminLanguage();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const invite = intent === "invite";

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void onSubmit(password, confirmation);
  }

  return (
    <main
      className="min-h-screen bg-[var(--color-panel)] flex items-center justify-center px-4"
      lang={adminLanguageTag(language)}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">HKSCDA</p>
            <h1 className="text-sm font-normal tracking-normal text-[var(--color-text-muted)] mt-1">
              {invite ? copy.login.setPasswordTitle : copy.login.resetTitle}
            </h1>
          </div>
          <AdminLanguageToggle />
        </div>

        {invite && (
          <p className="text-sm text-[var(--color-text-muted)]">
            {copy.login.setPasswordInstructions}
          </p>
        )}

        {status === "checking" && (
          <p role="status" className="text-sm text-[var(--color-text-muted)]">
            {copy.common.loading}
          </p>
        )}

        {status === "invalid" && (
          <div className="space-y-4">
            <p
              role="alert"
              className="rounded-lg bg-[var(--color-error-highlight)] px-3 py-2 text-sm text-[var(--color-error)]"
            >
              {invite ? copy.login.invalidInviteLink : copy.login.invalidRecoveryLink}
            </p>
            <button
              type="button"
              onClick={onBack}
              className="w-full py-2.5 border border-[var(--color-border)] rounded-lg font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-offset)] transition-colors"
            >
              {copy.login.backToLogin}
            </button>
          </div>
        )}

        {status === "ready" && (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="admin-new-password">
                {copy.login.newPassword}
              </label>
              <input
                id="admin-new-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="admin-confirm-password">
                {copy.login.confirmPassword}
              </label>
              <input
                id="admin-confirm-password"
                type="password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
                className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
              />
            </div>
            {error && (
              <p role="alert" className="text-[var(--color-error)] text-sm">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded-lg font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-60"
            >
              {loading
                ? invite
                  ? copy.login.setPasswordSaving
                  : copy.login.updatingPassword
                : invite
                  ? copy.login.setPasswordSubmit
                  : copy.login.updatePassword}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
