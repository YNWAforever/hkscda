import { useEffect, useRef, useState } from "react";
import { HelpCircle, MessageCircleQuestion, X } from "lucide-react";

import { trackHelpEvent } from "../../../lib/help/analytics";
import type { HelpLanguage } from "../../../lib/help/faq";
import { usePublicFixedActions } from "../fixedActions/PublicFixedActions";
import { HelpSearch } from "./HelpSearch";

export function HelpWidget() {
  const { helpOpen: open, setHelpOpen: setOpen } = usePublicFixedActions();
  const [language, setLanguage] = useState<HelpLanguage>("zh-HK");
  const panelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    const frame = window.requestAnimationFrame(() => {
      panelRef.current?.querySelector<HTMLInputElement>("input")?.focus();
    });

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.cancelAnimationFrame(frame);
    };
  }, [open]);

  function toggleOpen() {
    setOpen((current) => {
      const next = !current;
      if (next) {
        trackHelpEvent("help_widget_open", { language });
      }
      return next;
    });
  }

  const panelId = "help-widget-panel";

  return (
    <div
      className="fixed right-4 z-50 sm:right-6"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + var(--help-widget-bottom))" }}
    >
      {open && (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={language === "zh-HK" ? "HKSCDA 小幫手" : "HKSCDA help search"}
          className="mb-3 flex w-[calc(100vw-2rem)] max-w-[24rem] max-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-panel"
        >
          <div className="flex items-start justify-between gap-3 bg-[var(--color-panel)] px-4 py-3 text-white">
            <div className="flex min-w-0 items-start gap-2">
              <HelpCircle
                className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-secondary)]"
                aria-hidden="true"
              />
              <div className="min-w-0">
                <h2 className="font-display text-base font-bold leading-tight">
                  {language === "zh-HK" ? "HKSCDA 小幫手" : "HKSCDA help"}
                </h2>
                <p className="mt-1 text-xs leading-5 text-white/70">
                  {language === "zh-HK"
                    ? "助養、領養、捐款及收據"
                    : "Search sponsorship, adoption, donations, and receipts"}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white/80 transition-colors hover:bg-white/10 hover:text-white"
              aria-label={language === "zh-HK" ? "關閉客服" : "Close help panel"}
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-offset)] px-4 py-2">
            <div className="ml-auto inline-flex rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] p-1 text-xs font-bold">
              {(["zh-HK", "en"] as const).map((nextLanguage) => (
                <button
                  key={nextLanguage}
                  type="button"
                  aria-pressed={language === nextLanguage}
                  onClick={() => setLanguage(nextLanguage)}
                  className={`rounded-full px-3 py-1.5 transition-colors ${
                    language === nextLanguage
                      ? "bg-[var(--color-primary)] text-white"
                      : "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                  }`}
                >
                  {nextLanguage === "zh-HK" ? "繁" : "EN"}
                </button>
              ))}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <HelpSearch language={language} compact surface="widget" />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleOpen}
        className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-[var(--color-primary)] text-white shadow-panel transition-colors hover:bg-[var(--color-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-panel)]"
        aria-label={language === "zh-HK" ? "開啟 HKSCDA 小幫手" : "Open help search"}
        aria-controls={panelId}
        aria-expanded={open}
      >
        <MessageCircleQuestion className="h-6 w-6" aria-hidden="true" />
      </button>
    </div>
  );
}
