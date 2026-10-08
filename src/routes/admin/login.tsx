import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useSyncExternalStore, type FormEvent } from "react";
import {
  AdminLanguageProvider,
  AdminLanguageToggle,
  useAdminLanguage,
} from "../../components/admin/adminI18n";
import { requestAdminPasswordReset } from "../../lib/admin/passwordRecovery";
import { supabase } from "../../lib/supabase";

const subscribeToHydration = () => () => {};
const clientReady = () => true;
const serverNotReady = () => false;

type AdminLoginSearch = {
  passwordReset?: "success";
};

export const Route = createFileRoute("/admin/login")({
  validateSearch: (search: Record<string, unknown>): AdminLoginSearch => ({
    passwordReset: search.passwordReset === "success" ? "success" : undefined,
  }),
  component: AdminLoginPage,
});

function AdminLoginPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();

  return (
    <AdminLanguageProvider>
      <AdminLoginContent
        passwordResetSuccess={search.passwordReset === "success"}
        onSignedIn={() => navigate({ to: "/admin" })}
      />
    </AdminLanguageProvider>
  );
}

export function AdminLoginContent({
  passwordResetSuccess,
  onSignedIn,
}: {
  passwordResetSuccess: boolean;
  onSignedIn: () => void | Promise<void>;
}) {
  const { copy, language } = useAdminLanguage();
  const ready = useSyncExternalStore(subscribeToHydration, clientReady, serverNotReady);
  const [mode, setMode] = useState<"sign-in" | "request-reset">("sign-in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  function showSignIn() {
    setMode("sign-in");
    setError(null);
    setResetSent(false);
  }

  function showPasswordReset() {
    setMode("request-reset");
    setError(null);
    setResetSent(false);
  }

  async function handleSignIn(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(copy.login.error);
      return;
    }
    await onSignedIn();
  }

  async function handleResetRequest(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const result = await requestAdminPasswordReset({
      auth: supabase.auth,
      email,
      origin: window.location.origin,
    });
    setLoading(false);

    if (!result.ok) {
      setError(copy.login.resetError);
      return;
    }

    setResetSent(true);
  }

  return (
    <main
      className="min-h-screen bg-[var(--color-panel)] flex items-center justify-center px-4"
      lang={language === "en" ? "en" : "zh-HK"}
    >
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-2xl font-bold">HKSCDA</p>
            <h1 className="text-sm font-normal tracking-normal text-[var(--color-text-muted)] mt-1">
              {mode === "request-reset" ? copy.login.resetTitle : copy.login.subtitle}
            </h1>
          </div>
          <AdminLanguageToggle />
        </div>

        {passwordResetSuccess && mode === "sign-in" && (
          <p
            role="status"
            className="rounded-lg bg-[var(--color-success-highlight)] px-3 py-2 text-sm text-[var(--color-success)]"
          >
            {copy.login.passwordUpdated}
          </p>
        )}

        {mode === "request-reset" ? (
          resetSent ? (
            <div className="space-y-4">
              <p
                role="status"
                className="rounded-lg bg-[var(--color-success-highlight)] px-3 py-2 text-sm text-[var(--color-success)]"
              >
                {copy.login.resetSent}
              </p>
              <button
                type="button"
                onClick={showSignIn}
                className="w-full py-2.5 border border-[var(--color-border)] rounded-lg font-medium text-[var(--color-text)] hover:bg-[var(--color-surface-offset)] transition-colors"
              >
                {copy.login.backToLogin}
              </button>
            </div>
          ) : (
            <form onSubmit={handleResetRequest} className="space-y-4">
              <p className="text-sm text-[var(--color-text-muted)]">
                {copy.login.resetInstructions}
              </p>
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="admin-reset-email">
                  {copy.login.email}
                </label>
                <input
                  id="admin-reset-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
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
                disabled={!ready || loading}
                className="w-full py-2.5 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded-lg font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-60"
              >
                {loading ? copy.login.sendingResetLink : copy.login.sendResetLink}
              </button>
              <button
                type="button"
                onClick={showSignIn}
                disabled={!ready || loading}
                className="w-full py-2 text-sm font-medium text-[var(--color-primary)] hover:underline disabled:opacity-60"
              >
                {copy.login.backToLogin}
              </button>
            </form>
          )
        ) : (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="admin-login-email">
                {copy.login.email}
              </label>
              <input
                id="admin-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
                className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
              />
            </div>
            <div>
              <div className="mb-1 flex items-center justify-between gap-3">
                <label className="block text-sm font-medium" htmlFor="admin-login-password">
                  {copy.login.password}
                </label>
                <button
                  type="button"
                  onClick={showPasswordReset}
                  className="text-sm font-medium text-[var(--color-primary)] hover:underline"
                >
                  {copy.login.forgotPassword}
                </button>
              </div>
              <input
                id="admin-login-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
              disabled={!ready || loading}
              className="w-full py-2.5 bg-[var(--color-primary)] text-[var(--color-primary-foreground)] rounded-lg font-medium hover:bg-[var(--color-primary-hover)] transition-colors disabled:opacity-60"
            >
              {loading ? copy.login.loading : copy.login.submit}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
