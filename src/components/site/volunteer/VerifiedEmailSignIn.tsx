import { useEffect, useRef, useState } from "react";
import { getSupabaseClient } from "../../../lib/supabase";
import { TurnstileWidget, turnstileEnabled } from "../TurnstileWidget";
export function VerifiedEmailSignIn() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [captcha, setCaptcha] = useState("");
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const client = getSupabaseClient();
          const response = sent
            ? await client.auth.verifyOtp({ email, token: code, type: "email" })
            : await client.auth.signInWithOtp({
                email,
                options: { captchaToken: captcha || undefined },
              });
          if (response.error) throw response.error;
          setSent(true);
        } catch {
          setError("未能驗證電郵，請檢查資料後再試。");
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>請先驗證電郵，以便儲存及查看實習申請。</p>
      <label className="block">
        電郵
        <input
          className="block w-full rounded border p-2"
          type="email"
          required
          value={email}
          disabled={sent}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {sent && (
        <label className="block">
          電郵驗證碼
          <input
            className="block w-full rounded border p-2"
            required
            autoComplete="one-time-code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </label>
      )}
      {!sent && turnstileEnabled && <TurnstileWidget onVerify={setCaptcha} />}
      <button
        className="rounded border px-4 py-2"
        disabled={busy || (!sent && turnstileEnabled && !captcha)}
      >
        {sent ? "驗證並登入" : "取得登入驗證碼"}
      </button>
      {error && <p role="alert">{error}</p>}
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
