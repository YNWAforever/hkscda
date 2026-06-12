import {
  createElement,
  useEffect,
  useRef,
  type ElementType,
  type ComponentPropsWithoutRef,
} from "react";

// Shared observer so dozens of revealed elements cost one IntersectionObserver.
// Matches the reference behaviour: fire when the element enters the viewport,
// reveal once, never replay on scroll-up.
let observer: IntersectionObserver | null = null;
const callbacks = new WeakMap<Element, () => void>();

function getObserver() {
  if (!observer) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            callbacks.get(entry.target)?.();
            callbacks.delete(entry.target);
            observer?.unobserve(entry.target);
          }
        }
      },
      // Slight negative bottom margin ≈ Elementor waypoint offset: the element
      // must be ~60px inside the viewport before it fires.
      { rootMargin: "0px 0px -60px 0px" },
    );
  }
  return observer;
}

export function useReveal<T extends Element>() {
  const ref = useRef<T>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced motion: reveal immediately, no observation needed.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      el.classList.add("reveal-in");
      return;
    }
    callbacks.set(el, () => el.classList.add("reveal-in"));
    getObserver().observe(el);
    return () => {
      callbacks.delete(el);
      observer?.unobserve(el);
    };
  }, []);
  return ref;
}

type RevealProps<T extends ElementType> = {
  as?: T;
  /** "up" = fadeInUp (default, the page-wide motif); "zoom" = the play-button accent */
  variant?: "up" | "zoom";
} & ComponentPropsWithoutRef<T>;

// SSR renders the pre-reveal (hidden) state so first paint matches the
// reference: content fades in as it enters the viewport, including above the
// fold on load. No-JS environments are covered by the `(scripting: none)`
// media query in styles.css.
export function Reveal<T extends ElementType = "div">({
  as,
  variant = "up",
  className,
  ...rest
}: RevealProps<T>) {
  const ref = useReveal<HTMLElement>();
  return createElement(as ?? "div", {
    ref,
    className: [variant === "zoom" ? "reveal reveal-zoom" : "reveal", className]
      .filter(Boolean)
      .join(" "),
    ...rest,
  });
}
