export const TURNSTILE_SCRIPT_SRC =
  "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let scriptPromise: Promise<void> | null = null;

export function clearTurnstileScriptFailure(documentRef: Document = document) {
  const script = documentRef.querySelector<HTMLScriptElement>(
    'script[src="' + TURNSTILE_SCRIPT_SRC + '"]',
  );
  if (script?.dataset.loadState === "error") script.remove();
  scriptPromise = null;
}

export function loadTurnstileScript(
  windowRef: Window = window,
  documentRef: Document = document,
): Promise<void> {
  if (windowRef.turnstile) return Promise.resolve();
  if (scriptPromise) return scriptPromise;
  scriptPromise = new Promise<void>((resolve, reject) => {
    const existing = documentRef.querySelector<HTMLScriptElement>(
      'script[src="' + TURNSTILE_SCRIPT_SRC + '"]',
    );
    const script = existing ?? documentRef.createElement("script");
    const loaded = () => {
      script.dataset.loadState = "loaded";
      resolve();
    };
    const failed = () => {
      script.dataset.loadState = "error";
      scriptPromise = null;
      reject(new Error("Failed to load Turnstile"));
    };
    script.addEventListener("load", loaded, { once: true });
    script.addEventListener("error", failed, { once: true });
    if (!existing) {
      script.src = TURNSTILE_SCRIPT_SRC;
      script.async = true;
      script.defer = true;
      documentRef.head.appendChild(script);
    } else if (script.dataset.loadState === "error") {
      failed();
    }
  });
  return scriptPromise;
}
