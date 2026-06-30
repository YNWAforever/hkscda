import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "../../lib/supabase";
import {
  AdminLanguageProvider,
  AdminLanguageToggle,
  useAdminLanguage,
} from "../../components/admin/adminI18n";

export const Route = createFileRoute("/admin/login")({
  component: AdminLoginPage,
});

function AdminLoginPage() {
  return (
    <AdminLanguageProvider>
      <AdminLoginContent />
    </AdminLanguageProvider>
  );
}

function AdminLoginContent() {
  const navigate = useNavigate();
  const { copy } = useAdminLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (authError) {
      setError(copy.login.error);
      return;
    }
    navigate({ to: "/admin" });
  }

  return (
    <main className="min-h-screen bg-slate-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm bg-white rounded-2xl p-8 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-2xl font-bold">HKSCDA</div>
            <div className="text-sm text-gray-500 mt-1">{copy.login.subtitle}</div>
          </div>
          <AdminLanguageToggle />
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">{copy.login.email}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{copy.login.password}</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
            />
          </div>
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2.5 bg-slate-800 text-white rounded-lg font-medium hover:bg-slate-700 transition-colors disabled:opacity-60"
          >
            {loading ? copy.login.loading : copy.login.submit}
          </button>
        </form>
      </div>
    </main>
  );
}
