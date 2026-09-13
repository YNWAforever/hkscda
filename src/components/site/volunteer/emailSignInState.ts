export type EmailSignInState = {
  stage: "email" | "code" | "complete";
  email: string;
  busy: boolean;
  error: string;
  resendAt: number;
};
export const initialEmailSignInState: EmailSignInState = {
  stage: "email",
  email: "",
  busy: false,
  error: "",
  resendAt: 0,
};
type EmailSignInAction =
  | { type: "start" }
  | { type: "sent"; email: string; now: number }
  | { type: "failed"; message: string }
  | { type: "edit" }
  | { type: "verified" };
export function emailSignInReducer(
  state: EmailSignInState,
  action: EmailSignInAction,
): EmailSignInState {
  switch (action.type) {
    case "start":
      return { ...state, busy: true, error: "" };
    case "sent":
      return {
        ...state,
        stage: "code",
        email: action.email,
        busy: false,
        error: "",
        resendAt: action.now + 60_000,
      };
    case "failed":
      return { ...state, busy: false, error: action.message };
    case "edit":
      return { ...state, stage: "email", busy: false, error: "" };
    case "verified":
      return { ...state, stage: "complete", busy: false, error: "" };
  }
}
export function normaliseSignInEmail(email: string): string | null {
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed) ? trimmed : null;
}
export function resendSecondsRemaining(resendAt: number, now: number): number {
  return Math.max(0, Math.ceil((resendAt - now) / 1000));
}
export function safeEmailRedirect(
  requested: string | undefined,
  currentHref: string | undefined,
): string | undefined {
  if (!currentHref) return undefined;
  try {
    const current = new URL(currentHref);
    const target = new URL(requested ?? currentHref, current);
    if (!/^https?:$/.test(target.protocol) || target.origin !== current.origin) return undefined;
    target.hash = "";
    return target.href;
  } catch {
    return undefined;
  }
}
