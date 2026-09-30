import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";

import {
  getSupabaseClient,
  installRecoverySession,
  captureRecoverySessionAttempt,
} from "../lib/supabase";
import { RecoverySessionUnavailableError } from "../lib/supporters/recoverySession";
import { TurnstileWidget, turnstileEnabled } from "../components/site/TurnstileWidget";
import { SupporterPortal } from "../components/site/supporter/SupporterPortal";

export const Route = createFileRoute("/supporter")({
  component: SupporterPage,
});

export function SupporterPage() {
  const [email, setEmail] = useState("");
  const [verifiedEmail, setVerifiedEmail] = useState("");
  const [challengeId, setChallengeId] = useState("");
  const [code, setCode] = useState("");
  const [challengeToken, setChallengeToken] = useState("");
  const [challengeKey, setChallengeKey] = useState(0);
  const [stage, setStage] = useState<"request" | "code" | "verified">("request");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const mounted = useRef(false);
  const authGeneration = useRef(0);

  useEffect(() => {
    mounted.current = true;
    const initialGeneration = ++authGeneration.current;
    const client = getSupabaseClient();
    void client.auth.getSession().then(({ data }) => {
      if (!mounted.current || initialGeneration !== authGeneration.current) return;
      setAccessToken(data.session?.access_token ?? "");
      if (data.session) setStage("verified");
    });
    const { data } = client.auth.onAuthStateChange((_event, session) => {
      authGeneration.current++;
      setAccessToken(session?.access_token ?? "");
      setStage(session ? "verified" : "request");
      if (!session) {
        setCode("");
        setVerifiedEmail("");
        setChallengeId("");
      }
    });
    return () => {
      mounted.current = false;
      data.subscription.unsubscribe();
    };
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    const attemptGeneration = authGeneration.current;
    const currentAttempt = () => mounted.current && attemptGeneration === authGeneration.current;
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
        const result: unknown = await response.json();
        if (!currentAttempt()) return;
        if (
          !result ||
          typeof result !== "object" ||
          !("challengeId" in result) ||
          typeof result.challengeId !== "string" ||
          !/^[0-9a-f-]{36}$/.test(result.challengeId)
        )
          throw new Error("request");
        setChallengeId(result.challengeId);
        setVerifiedEmail(normalized);
        setStage("code");
        setCode("");
      } else {
        const sessionSnapshot = await captureRecoverySessionAttempt(currentAttempt);
        const response = await fetch("/api/supporter/recovery/verify", {
          method: "POST",
          headers: { "content-type": "application/json" },
          cache: "no-store",
          body: JSON.stringify({
            email: verifiedEmail,
            challengeId,
            code: code.trim(),
            challengeToken,
          }),
        });
        if (!response.ok) throw new Error("verify");
        const session: unknown = await response.json();
        if (!currentAttempt()) return;
        if (
          !session ||
          typeof session !== "object" ||
          !("access_token" in session) ||
          !("refresh_token" in session) ||
          typeof session.access_token !== "string" ||
          typeof session.refresh_token !== "string"
        )
          throw new Error("verify");
        const { data, error: verifyError } = await installRecoverySession(
          {
            access_token: session.access_token,
            refresh_token: session.refresh_token,
          },
          currentAttempt,
          sessionSnapshot,
        );
        if (verifyError || !data.session) throw new Error("verify");
        if (mounted.current) setCode("");
      }
    } catch (failure) {
      if (!currentAttempt()) return;
      setError(
        failure instanceof RecoverySessionUnavailableError
          ? "驗證服務暫時無法使用，請聯絡職員協助。"
          : stage === "request"
            ? "暫時無法處理，請稍後再試或聯絡職員。"
            : "驗證碼無效或已過期，請重新取得登入電郵。",
      );
    } finally {
      if (mounted.current) {
        // Both forms require a fresh token after every attempt, including a downstream failure.
        setChallengeToken("");
        setChallengeKey((value) => value + 1);
        setBusy(false);
      }
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
          <div>
            <p className="mb-2 text-sm text-[var(--color-text-muted)]">繼續前需完成人機驗證。</p>
            {turnstileEnabled && (
              <TurnstileWidget
                key={challengeKey}
                onVerify={setChallengeToken}
                onExpire={() => setChallengeToken("")}
              />
            )}
          </div>
          <button
            className="btn-primary min-h-11"
            type="submit"
            disabled={busy || (turnstileEnabled && !challengeToken)}
          >
            {busy ? "處理中…" : stage === "request" ? "取得登入電郵" : "驗證並繼續"}
          </button>
          {stage === "code" && (
            <button
              className="btn-secondary ml-3 min-h-11"
              type="button"
              disabled={busy}
              onClick={() => {
                setStage("request");
                setVerifiedEmail("");
                setChallengeId("");
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
