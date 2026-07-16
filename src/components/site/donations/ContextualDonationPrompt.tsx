import { Heart, X } from "lucide-react";
import { useEffect, type RefCallback } from "react";

import {
  buildDonationAttribution,
  buildDonationPromptHref,
} from "../../../lib/donations/attribution";
import { markDonationEventOnce, trackDonationEvent } from "../../../lib/donations/analytics";
import { resolveDonationPrompt } from "../../../lib/donations/prompt";
import { useIsMobile } from "../../../hooks/use-mobile";
import {
  useFixedActionRegistration,
  usePublicFixedActions,
} from "../fixedActions/PublicFixedActions";
import { useDonationPromptTrigger } from "./useDonationPromptTrigger";

type DonationPromptSurfaceProps = {
  message: string;
  action: string;
  href: string;
  onDismiss: () => void;
  onClick?: () => void;
  register: RefCallback<HTMLElement>;
};

export function DonationPromptSurface({
  message,
  action,
  href,
  onDismiss,
  onClick,
  register,
}: DonationPromptSurfaceProps) {
  return (
    <aside
      ref={register}
      data-donation-prompt
      aria-label="捐助提示"
      className="fixed inset-x-3 z-40 mx-auto max-w-sm animate-in fade-in slide-in-from-bottom-2 duration-200 motion-reduce:animate-none md:left-6 md:right-auto md:mx-0"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + var(--donation-prompt-bottom))" }}
    >
      <div className="flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-3 shadow-panel">
        <Heart className="h-5 w-5 shrink-0 text-[var(--color-primary)]" aria-hidden="true" />
        <p className="min-w-0 flex-1 text-sm font-medium leading-5 text-[var(--color-panel)]">
          {message}
        </p>
        <a
          href={href}
          onClick={onClick}
          className="btn-primary min-h-11 shrink-0 px-3! py-2! text-sm! focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
        >
          {action}
        </a>
        <button
          type="button"
          onClick={onDismiss}
          className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-[var(--color-text-muted)] transition-colors hover:bg-[var(--color-surface-offset)] hover:text-[var(--color-panel)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-primary)]"
          aria-label="關閉捐助提示"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>
      </div>
    </aside>
  );
}

export function ContextualDonationPrompt({ pathname }: { pathname: string }) {
  const profile = resolveDonationPrompt(pathname);
  const isMobile = useIsMobile();
  const placement = isMobile ? "mobile-bottom" : "desktop-left";
  const { helpOpen } = usePublicFixedActions();
  const { visible, trigger, dismiss } = useDonationPromptTrigger(pathname, profile !== null);
  const rendered = Boolean(profile && visible && trigger && !helpOpen);
  const register = useFixedActionRegistration("donation", rendered);

  const attribution =
    profile && trigger ? buildDonationAttribution(profile, placement, trigger) : null;
  const href = attribution ? buildDonationPromptHref(attribution) : "";

  useEffect(() => {
    if (!rendered || !attribution) return;

    const journeyKey = `${pathname}:${attribution.placement}:${attribution.trigger}`;
    if (markDonationEventOnce("donation_cta_impression", journeyKey)) {
      trackDonationEvent("donation_cta_impression", { attribution });
    }
  }, [attribution, pathname, rendered]);

  if (!profile || !rendered || !attribution) return null;

  return (
    <DonationPromptSurface
      message={profile.zh.message}
      action={profile.zh.action}
      href={href}
      onDismiss={dismiss}
      onClick={() => trackDonationEvent("donation_cta_click", { attribution })}
      register={register}
    />
  );
}
