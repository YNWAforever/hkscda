import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import {
  AdminLanguageProvider,
  AdminLanguageToggle,
  useAdminLanguage,
} from "../../components/admin/adminI18n";
import {
  completeAdminPasswordReset,
  type PasswordRecoveryFailure,
} from "../../lib/admin/passwordRecovery";
import { supabase } from "../../lib/supabase";

export type RecoveryStatus = "checking" | "ready" | "invalid";

export const Route = createFileRoute("/admin/reset-password")({
  component: AdminResetPasswordPage,
});

function AdminResetPasswordPage() {
  const navigate = useNavigate();

  return (
    <AdminLanguageProvider>
      <AdminResetPasswordController
        onComplete={() => navigate({ to: "/admin/login", search: { passwordReset: "success" } })}
        onBack={() => navigate({ to: "/admin/login", search: {} })}
      />
    </AdminLanguageProvider>
  );
}

function AdminResetPasswordController({
  onComplete,
  onBack,
}: {
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
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active || event !== "PASSWORD_RECOVERY" || !session) return;
      recoverySeen = true;
      setStatus("ready");
    });

    void supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active || recoverySeen) return;
      setStatus(!sessionError && data.session ? "ready" : "invalid");
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  function getFailureMessage(reason: PasswordRecoveryFailure) {
    if (reason === "too_short") return copy.login.passwordTooShort;
    if (reason === "mismatch") return copy.login.passwordMismatch;
    return copy.login.updateError;
  }

  async function handleSubmit(password: string, confirmation: string) {
    setLoading(true);
    setError(null);
    const result = await completeAdminPasswordReset({
      auth: supabase.auth,
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
      loading={loading}
      error={error}
      onSubmit={handleSubmit}
      onBack={onBack}
    />
  );
}

export interface AdminResetPasswordFormProps {
  status: RecoveryStatus;
  loading: boolean;
  error: string | null;
  onSubmit: (password: string, confirmation: string) => void | Promise<void>;
  onBack: () => void;
}

export function AdminResetPasswordForm({
  status,
  loading,
  error,
  onSubmit,
  onBack,
}: AdminResetPasswordFormProps) {
  const { copy } = useAdminLanguage();
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    void onSubmit(password, confirmation);
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">HKSCDA</div>
            <div className="text-sm text-gray-500 mt-1">{copy.login.resetTitle}</div>
          </div>
          <AdminLanguageToggle />
        </div>

        {status === "checking" && (
          <p role="status" className="text-sm text-gray-600">
            {copy.common.loading}
          </p>
        )}

        {status === "invalid" && (
          <div className="space-y-4">
            <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
              {copy.login.invalidRecoveryLink}
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
              <p role="alert" className="text-red-600 text-sm">
                {error}
              </p>
            )}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-60"
            >
              {loading ? copy.login.updatingPassword : copy.login.updatePassword}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
