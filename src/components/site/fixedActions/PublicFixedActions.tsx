import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
  type RefCallback,
} from "react";

import { calculateFixedActionLayout } from "./fixedActionLayout";

type FixedActionName = "shortlist" | "donation";

type PublicFixedActionsContextValue = {
  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;
  setFixedActionHeight: (name: FixedActionName, height: number) => void;
};

const PublicFixedActionsContext = createContext<PublicFixedActionsContextValue | null>(null);

export function PublicFixedActionsProvider({ children }: { children: ReactNode }) {
  const [shortlistHeight, setShortlistHeight] = useState(0);
  const [donationHeight, setDonationHeight] = useState(0);
  const [helpOpen, setHelpOpen] = useState(false);

  const setFixedActionHeight = useCallback((name: FixedActionName, height: number) => {
    const nextHeight = Math.max(0, Math.ceil(height));
    const setHeight = name === "shortlist" ? setShortlistHeight : setDonationHeight;
    setHeight((currentHeight) => (currentHeight === nextHeight ? currentHeight : nextHeight));
  }, []);

  const value = useMemo(
    () => ({ helpOpen, setHelpOpen, setFixedActionHeight }),
    [helpOpen, setFixedActionHeight],
  );
  const layout = calculateFixedActionLayout({ shortlistHeight, donationHeight });
  const style = {
    "--donation-prompt-bottom": `${layout.donationBottom}px`,
    "--help-widget-bottom": `${layout.helpBottom}px`,
    "--public-content-bottom-offset": `${layout.contentBottom}px`,
  } as CSSProperties;

  return (
    <PublicFixedActionsContext.Provider value={value}>
      <div className="site-shell min-h-dvh" style={style}>
        {children}
      </div>
    </PublicFixedActionsContext.Provider>
  );
}

export function usePublicFixedActions() {
  const context = useContext(PublicFixedActionsContext);
  if (!context) {
    throw new Error("usePublicFixedActions must be used within PublicFixedActionsProvider");
  }

  return context;
}

export function useFixedActionRegistration(
  name: FixedActionName,
  active: boolean,
): RefCallback<HTMLElement> {
  const { setFixedActionHeight } = usePublicFixedActions();
  const elementRef = useRef<HTMLElement | null>(null);

  const ref = useCallback<RefCallback<HTMLElement>>((element) => {
    elementRef.current = element;
  }, []);

  useEffect(() => {
    if (!active) {
      setFixedActionHeight(name, 0);
      return;
    }

    const element = elementRef.current;
    if (!element) return;

    const measure = () => setFixedActionHeight(name, element.getBoundingClientRect().height);
    measure();

    if (typeof ResizeObserver === "undefined") {
      return () => setFixedActionHeight(name, 0);
    }

    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => {
      observer.disconnect();
      setFixedActionHeight(name, 0);
    };
  }, [active, name, setFixedActionHeight]);

  return ref;
}
