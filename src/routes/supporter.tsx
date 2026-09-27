import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { getSupabaseClient } from "../lib/supabase";
import { TurnstileWidget, turnstileEnabled } from "../components/site/TurnstileWidget";
import { SupporterPortal } from "../components/site/supporter/SupporterPortal";

export const Route = createFileRoute("/supporter")({
  component: SupporterPage,
});

export function SupporterPage() {
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);
  const [stage, setStage] = useState<"request" | "code" | "verified">("request");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessToken, setAccessToken] = useState("");

  useEffect(() => {
    const client = getSupabaseClient();
    let disposed = false;
    let authEventSeen = false;
    void client.auth.getSession().then(({ data }) => {
      if (disposed || authEventSeen) return;
      setAccessToken(data.session?.access_token ?? "");
      if (data.session) setStage("verified");
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      authEventSeen = true;
      setAccessToken(session?.access_token ?? "");
      setStage(session ? "verified" : "request");
      if (!session) {
        setCode("");
        setVerifiedEmail("");
      }
    });
    return () => {
      disposed = true;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (stage === "request") {
        const normalized = email.trim().toLowerCase();
        const response = await fetch("/api/supporter/recovery", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: normalized, challengeToken }),
          cache: "no-store",
        });
        if (!response.ok) throw new Error("request");
        setVerifiedEmail(normalized);
        setStage("code");
        setCode("");
        setChallengeToken("");
        setChallengeKey((value) => value + 1);
      } else {
        const { data, error: verifyError } = await getSupabaseClient().auth.verifyOtp({
          email: verifiedEmail,
          token: code.trim(),
          type: "email",
        });
        if (verifyError || !data.session) throw new Error("verify");
        setStage("verified");
        setCode("");
      }
    } catch {
      setError(
        stage === "request"
          ? "暫時無法處理，請稍後再試或聯絡職員。"
          : "驗證碼無效或已過期，請重新取得登入電郵。",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto max-w-2xl px-5 py-12">
      <h1 className="text-3xl font-semibold">找回支持者紀錄</h1>
      <p className="mt-4 text-[var(--color-text-muted)]">
        使用電郵驗證身份，以找回領養、助養及收條紀錄。如該電郵有關聯紀錄，請查看收件匣及垃圾郵件；我們不會在此頁確認帳戶是否存在。
      </p>
      {stage === "verified" ? (
        accessToken ? (
          <SupporterPortal accessToken={accessToken} />
        ) : (
          <p role="status" className="mt-8">
            正在驗證登入狀態…
          </p>
        )
      ) : (
        <form className="mt-8 space-y-5" onSubmit={(event) => void submit(event)}>
          {stage === "request" ? (
            <label className="block">
              電郵地址
              <input
                className="mt-2 block min-h-11 w-full rounded-lg border px-3"
                type="email"
                required
                autoComplete="email"
                value={email}
                disabled={busy}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
          ) : (
            <>
              <p role="status">如該電郵可用，登入電郵會寄往 {verifiedEmail}。</p>
              <label className="block">
                電郵驗證碼
                <input
                  className="mt-2 block min-h-11 w-full rounded-lg border px-3"
                  required
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  value={code}
                  disabled={busy}
                  onChange={(event) => setCode(event.target.value)}
                />
              </label>
            </>
          )}
          {stage === "request" && (
            <div>
              <p className="mb-2 text-sm text-[var(--color-text-muted)]">發送前需完成人機驗證。</p>
              {turnstileEnabled && (
                <TurnstileWidget
                  key={challengeKey}
                  onVerify={setChallengeToken}
                  onExpire={() => setChallengeToken("")}
                />
              )}
            </div>
          )}
          <button
            className="btn-primary min-h-11"
            type="submit"
            disabled={busy || (stage === "request" && turnstileEnabled && !challengeToken)}
          >
            {busy ? "處理中…" : stage === "request" ? "取得登入電郵" : "驗證並繼續"}
          </button>
          {stage === "code" && (
            <button
              className="btn-secondary ml-3 min-h-11"
              type="button"
              onClick={() => {
                setStage("request");
                setCode("");
                setError("");
              }}
            >
              重新取得連結
            </button>
          )}
          {error && (
            <p role="alert" className="text-[var(--color-error)]">
              {error}
            </p>
          )}
        </form>
      )}
    </main>
  );
}
