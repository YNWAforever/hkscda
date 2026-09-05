import { useEffect, useRef, useState } from "react";

import { clearTurnstileScriptFailure, loadTurnstileScript } from "./turnstileScript";

const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

type TurnstileRenderOptions = {
  sitekey: string;
  callback: (token: string) => void;
  "expired-callback"?: () => void;
  "error-callback"?: () => void;
  language?: string;
  appearance?: "always" | "execute" | "interaction-only";
};

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, opts: TurnstileRenderOptions) => string;
      remove: (id: string) => void;
      reset: (id?: string) => void;
    };
  }
}

/** True when a Turnstile site key is configured; lets forms skip gating in dev. */
export const turnstileEnabled = Boolean(SITE_KEY);

type TurnstileWidgetProps = {
  onVerify: (token: string) => void;
  onExpire?: () => void;
  language?: string;
  className?: string;
  resetKey?: number;
};

/**
 * Client-only Cloudflare Turnstile widget. Renders nothing when no site key is
 * configured (dev/preview), so forms remain usable without Turnstile set up.
 * The widget is injected inside an effect to avoid SSR/hydration mismatches.
 */
export function TurnstileWidget({
  onVerify,
  onExpire,
  language,
  className,
  resetKey = 0,
}: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const previousResetKeyRef = useRef(resetKey);
  const onVerifyRef = useRef(onVerify);
  const onExpireRef = useRef(onExpire);
  const [scriptAttempt, setScriptAttempt] = useState(0);
  const [scriptFailed, setScriptFailed] = useState(false);
  onVerifyRef.current = onVerify;
  onExpireRef.current = onExpire;

  useEffect(() => {
    if (previousResetKeyRef.current === resetKey) return;
    previousResetKeyRef.current = resetKey;
    onExpireRef.current?.();
  }, [resetKey]);

  useEffect(() => {
    if (!SITE_KEY) return;
    let cancelled = false;

    loadTurnstileScript()
      .then(() => {
        if (cancelled || widgetIdRef.current || !containerRef.current || !window.turnstile) return;
        widgetIdRef.current = window.turnstile.render(containerRef.current, {
          sitekey: SITE_KEY,
          language,
          callback: (token: string) => onVerifyRef.current(token),
          "expired-callback": () => onExpireRef.current?.(),
          "error-callback": () => onExpireRef.current?.(),
        });
        setScriptFailed(false);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setScriptFailed(true);
      });

    return () => {
      cancelled = true;
      if (widgetIdRef.current && window.turnstile) {
        try {
          window.turnstile.remove(widgetIdRef.current);
        } catch {
          // Widget already gone; nothing to clean up.
        }
        widgetIdRef.current = null;
      }
    };
  }, [language, resetKey, scriptAttempt]);

  if (!SITE_KEY) return null;
  return (
    <div className={className}>
      <div ref={containerRef} role="group" aria-label="人機驗證" />
      {scriptFailed && (
        <div role="alert" className="space-y-2 text-sm text-[var(--color-error)]">
          <p>人機驗證暫時未能載入，請重試。</p>
          <button
            type="button"
            className="btn-secondary min-h-11 px-4"
            onClick={() => {
              clearTurnstileScriptFailure();
              setScriptFailed(false);
              setScriptAttempt((attempt) => attempt + 1);
            }}
          >
            重新載入人機驗證
          </button>
        </div>
      )}
    </div>
  );
}
