import { useEffect, useId, useReducer, useRef, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase";
import { TurnstileWidget, turnstileEnabled } from "../TurnstileWidget";
import {
  emailSignInReducer,
  initialEmailSignInState,
  normaliseSignInEmail,
  resendSecondsRemaining,
  safeEmailRedirect,
} from "./emailSignInState";

type VerifiedEmailSignInProps = {
  emailRedirectTo?: string;
  onSignedIn?: () => void;
};
export function VerifiedEmailSignIn({
  emailRedirectTo,
  onSignedIn,
}: VerifiedEmailSignInProps = {}) {
  const [state, dispatch] = useReducer(emailSignInReducer, initialEmailSignInState);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [captcha, setCaptcha] = useState("");
  const [resetKey, setResetKey] = useState(0);
  const [now, setNow] = useState(0);
  const inFlight = useRef(false);
  const emailInput = useRef<HTMLInputElement>(null);
  const codeInput = useRef<HTMLInputElement>(null);
  const id = useId();
  const remaining = resendSecondsRemaining(state.resendAt, now);
  const sent = state.stage === "code";

  useEffect(() => {
    if (!state.resendAt) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [state.resendAt]);
  useEffect(() => {
    if (state.stage === "code") codeInput.current?.focus();
  }, [state.stage]);

  async function sendCode() {
    if (inFlight.current || resendSecondsRemaining(state.resendAt, Date.now()) > 0) return;
    const validatedEmail = normaliseSignInEmail(sent ? state.email : email);
    if (!validatedEmail) {
      dispatch({ type: "failed", message: "請輸入有效的電郵地址。" });
      emailInput.current?.focus();
      return;
    }
    if (turnstileEnabled && !captcha) {
      dispatch({ type: "failed", message: "請先完成人機驗證。" });
      return;
    }
    inFlight.current = true;
    dispatch({ type: "start" });
    try {
      const response = await getSupabaseClient().auth.signInWithOtp({
        email: validatedEmail,
        options: {
          captchaToken: captcha || undefined,
          emailRedirectTo: safeEmailRedirect(
            emailRedirectTo,
            typeof window === "undefined" ? undefined : window.location.href,
          ),
        },
      });
      if (response.error) throw response.error;
      const sentAt = Date.now();
      setNow(sentAt);
      setCode("");
      setEmail(validatedEmail);
      dispatch({ type: "sent", email: validatedEmail, now: sentAt });
    } catch {
      dispatch({ type: "failed", message: "暫時未能發送登入電郵，請稍後再試。" });
    } finally {
      setCaptcha("");
      setResetKey((key) => key + 1);
      inFlight.current = false;
    }
  }
  async function verifyCode() {
    if (inFlight.current) return;
    if (!code.trim()) {
      dispatch({ type: "failed", message: "請輸入電郵內的驗證碼。" });
      codeInput.current?.focus();
      return;
    }
    inFlight.current = true;
    dispatch({ type: "start" });
    try {
      const response = await getSupabaseClient().auth.verifyOtp({
        email: state.email,
        token: code.trim(),
        type: "email",
      });
      if (response.error || !response.data.session)
        throw response.error ?? new Error("Session missing");
      dispatch({ type: "verified" });
    } catch {
      dispatch({
        type: "failed",
        message: "驗證碼無效或已過期，請檢查後重試，或重新發送登入電郵。",
      });
      return;
    } finally {
      inFlight.current = false;
    }
    onSignedIn?.();
  }
  if (state.stage === "complete")
    return (
      <p className="volunteer-auth" role="status">
        電郵驗證成功，正在載入會員中心。
      </p>
    );

  return (
    <form
      className="volunteer-auth space-y-4"
      aria-busy={state.busy}
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void (sent ? verifyCode() : sendCode());
      }}
    >
      <p className="text-[var(--color-text-muted)]">
        使用電郵登入，儲存報名及查看義工或實習申請紀錄。
      </p>
      {sent ? (
        <div className="volunteer-auth__sent">
          <p role="status">
            登入電郵已寄往 <strong className="break-all">{state.email}</strong>
          </p>
          <p className="text-sm text-[var(--color-text-muted)]">
            請查看收件匣及垃圾郵件。可使用電郵中的登入連結，或輸入驗證碼。
          </p>
        </div>
      ) : (
        <label className="block" htmlFor={`${id}-email`}>
          電郵地址
          <input
            ref={emailInput}
            id={`${id}-email`}
            className="volunteer-auth__input mt-2 block min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            type="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            required
            value={email}
            disabled={state.busy}
            aria-describedby={state.error ? `${id}-error` : undefined}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>
      )}
      {sent && (
        <label className="block" htmlFor={`${id}-code`}>
          電郵驗證碼
          <input
            ref={codeInput}
            id={`${id}-code`}
            className="volunteer-auth__input mt-2 block min-h-11 w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3"
            required
            autoComplete="one-time-code"
            inputMode="numeric"
            autoCapitalize="none"
            spellCheck={false}
            value={code}
            disabled={state.busy}
            aria-describedby={state.error ? `${id}-error` : undefined}
            onChange={(event) => setCode(event.target.value)}
          />
        </label>
      )}
      {turnstileEnabled && (!sent || remaining === 0) && (
        <TurnstileWidget
          onVerify={setCaptcha}
          onExpire={() => setCaptcha("")}
          resetKey={resetKey}
        />
      )}
      <button
        className="btn-primary min-h-11 w-full"
        disabled={state.busy || (!sent && (remaining > 0 || (turnstileEnabled && !captcha)))}
      >
        {state.busy
          ? "處理中…"
          : sent
            ? "驗證並登入"
            : remaining > 0
              ? `請等候 ${remaining} 秒再發送`
              : "取得登入電郵"}
      </button>
      {sent && (
        <div className="volunteer-auth__actions flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-secondary min-h-11"
            disabled={state.busy || remaining > 0 || (turnstileEnabled && !captcha)}
            onClick={() => void sendCode()}
          >
            {remaining > 0 ? `${remaining} 秒後可重新發送` : "重新發送登入電郵"}
          </button>
          <button
            type="button"
            className="btn-secondary min-h-11"
            disabled={state.busy}
            onClick={() => {
              setCode("");
              setCaptcha("");
              setResetKey((key) => key + 1);
              dispatch({ type: "edit" });
              window.setTimeout(() => emailInput.current?.focus(), 0);
            }}
          >
            更改電郵地址
          </button>
        </div>
      )}
      {state.error && (
        <p id={`${id}-error`} role="alert" className="text-[var(--color-error)]">
          {state.error}
        </p>
      )}
    </form>
  );
}
export function useVerifiedSession() {
  const [token, setToken] = useState("");
  useEffect(() => {
    const client = getSupabaseClient();
    void client.auth.getSession().then(({ data }) => setToken(data.session?.access_token ?? ""));
    const { data } = client.auth.onAuthStateChange((_event, session) =>
      setToken(session?.access_token ?? ""),
    );
    return () => data.subscription.unsubscribe();
  }, []);
  return token;
}
export function useCommandKey() {
  const key = useRef<{ hash: string; key: string } | null>(null);
  return (body: object) => {
    const hash = JSON.stringify(body);
    if (key.current?.hash !== hash) key.current = { hash, key: crypto.randomUUID() };
    return key.current.key;
  };
}
