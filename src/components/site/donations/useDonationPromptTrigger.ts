import { useCallback, useEffect, useReducer, useRef } from "react";

import {
  initialPromptTriggerState,
  reducePromptTrigger,
  scrollProgress,
} from "../../../lib/donations/promptTrigger";

const dismissalKey = "hkscda:donation-prompt:dismissed";
const triggerDelay = 10_000;
const minimumScrollProgress = 0.35;

export function isPromptStateCurrent(statePathname: string, pathname: string) {
  return statePathname === pathname;
}

function isDismissed() {
  try {
    return sessionStorage.getItem(dismissalKey) !== null;
  } catch {
    return false;
  }
}

export function useDonationPromptTrigger(pathname: string, enabled: boolean) {
  const [state, dispatch] = useReducer(reducePromptTrigger, initialPromptTriggerState);
  const statePathnameRef = useRef(pathname);
  const stateBelongsToPath = isPromptStateCurrent(statePathnameRef.current, pathname);

  useEffect(() => {
    statePathnameRef.current = pathname;
    const dismissed = isDismissed();
    dispatch({ type: "reset", dismissed });
    if (!enabled || dismissed) return;

    // Not const: removeTriggers() below closes over `timer` and can run on an
    // early cleanup, before the setTimeout further down ever assigns it. A const
    // declared at the assignment site would leave that read in the temporal dead
    // zone. prefer-const doesn't model read-before-assign by default.
    // eslint-disable-next-line prefer-const
    let timer: number | undefined;
    let qualified = false;

    const removeTriggers = () => {
      window.removeEventListener("scroll", onScroll);
      if (timer !== undefined) window.clearTimeout(timer);
    };

    const qualify = (trigger: "scroll" | "timer") => {
      if (qualified) return;
      qualified = true;
      removeTriggers();
      dispatch({ type: "qualify", trigger });
    };

    const onScroll = () => {
      const root = document.documentElement;
      const progress = scrollProgress({
        scrollY: window.scrollY,
        scrollHeight: root.scrollHeight,
        viewportHeight: window.innerHeight,
      });

      if (progress >= minimumScrollProgress) qualify("scroll");
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    timer = window.setTimeout(() => qualify("timer"), triggerDelay);
    onScroll();

    return removeTriggers;
  }, [enabled, pathname]);

  const dismiss = useCallback(() => {
    try {
      sessionStorage.setItem(dismissalKey, "1");
    } catch {
      // The in-memory dismissal still prevents the prompt during this render.
    }
    dispatch({ type: "dismiss" });
  }, []);

  return {
    visible: stateBelongsToPath && state.visible && enabled,
    trigger: stateBelongsToPath ? state.trigger : undefined,
    dismiss,
  };
}
