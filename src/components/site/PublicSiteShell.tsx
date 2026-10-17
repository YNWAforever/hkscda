import type { ReactNode } from "react";
import { Header } from "./Header";
import { Footer } from "./Footer";
import { HelpWidget } from "./help/HelpWidget";
import { ShortlistProvider } from "./ShortlistProvider";
import { ShortlistTray } from "./ShortlistTray";
import { PublicFixedActionsProvider } from "./fixedActions/PublicFixedActions";
import { ContextualDonationPrompt } from "./donations/ContextualDonationPrompt";

export default function PublicSiteShell({
  pathname,
  children,
}: {
  pathname: string;
  children: ReactNode;
}) {
  const isAdoptionWizard = /^\/adoption\/apply\/?$/.test(pathname);
  // The pledge form lists the selection itself; the tray's 開始助養 would only
  // repeat it and cover the form's own submit button on a phone.
  const isSponsorPledge = /^\/sponsors\/pledge\/?$/.test(pathname);
  // Task pages keep footer links but drop its closing statement and calls to action, which would
  // pull someone away from a form they are part-way through.
  const isFocusedFlow =
    /^\/(adoption\/apply|sponsors\/pledge|donate)\/?$/.test(pathname) ||
    pathname.includes("/status/");

  return (
    <ShortlistProvider>
      <PublicFixedActionsProvider>
        <div className="site-shell min-h-dvh" data-focused-flow={isFocusedFlow || undefined}>
          <Header />
          <div id="main-content" tabIndex={-1} data-site-content>
            {children}
          </div>
          <Footer />
          {isAdoptionWizard || isSponsorPledge ? null : <ShortlistTray />}
          <ContextualDonationPrompt pathname={pathname} />
          <HelpWidget />
        </div>
      </PublicFixedActionsProvider>
    </ShortlistProvider>
  );
}
