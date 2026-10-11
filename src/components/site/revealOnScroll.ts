import { useEffect, type CSSProperties, type RefObject } from "react";

/**
 * Only content that starts below the fold is deferred. Anything already on
 * screen when the page hydrates stays exactly as the server painted it, so the
 * reveal never hides the hero, never flashes, and never delays LCP.
 */
export function shouldDeferReveal(top: number, viewportHeight: number) {
  return top > viewportHeight * 0.92;
}

/** Staggers siblings that reveal together; read by the CSS as --reveal-index. */
export function revealOrder(index: number): CSSProperties {
  return { "--reveal-index": index } as CSSProperties;
}

/**
 * Progressive scroll reveal for public pages. Elements opt in with
 * `data-reveal`; the server always renders them visible, and this hook marks the
 * below-the-fold ones `pending` on hydration and `shown` as they enter view.
 * Without JavaScript, without IntersectionObserver, or with reduced motion
 * requested, nothing is ever hidden.
 */
export function useRevealOnScroll(rootRef: RefObject<HTMLElement | null>) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>("[data-reveal]")).filter(
      (element) => shouldDeferReveal(element.getBoundingClientRect().top, window.innerHeight),
    );
    if (!targets.length) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          entry.target.setAttribute("data-reveal-state", "shown");
          observer.unobserve(entry.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px", threshold: 0.08 },
    );
    for (const element of targets) {
      element.setAttribute("data-reveal-state", "pending");
      observer.observe(element);
    }

    return () => {
      observer.disconnect();
      for (const element of targets) element.removeAttribute("data-reveal-state");
    };
  }, [rootRef]);
}
