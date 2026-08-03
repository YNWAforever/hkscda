export const MAP_ROOT_MARGIN = "600px";
export const MAP_IDLE_TIMEOUT_MS = 2000;

type ObserverHandle = { observe(target: Element): void; disconnect(): void };

export type DeferredMapEnvironment = {
  createObserver?: (
    callback: (entries: Array<{ isIntersecting: boolean }>) => void,
    options: { rootMargin: string },
  ) => ObserverHandle;
  requestIdle?: (callback: () => void, options: { timeout: number }) => number;
  cancelIdle?: (id: number) => void;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(id: number): void;
};

export function observeNearViewport(
  target: Element,
  onNear: () => void,
  env: DeferredMapEnvironment,
) {
  if (!env.createObserver) {
    onNear();
    return () => {};
  }

  let activated = false;
  let disposed = false;
  const observerRef: { current?: ObserverHandle } = {};
  const observer = env.createObserver(
    (entries) => {
      if (disposed || activated || !entries.some((entry) => entry.isIntersecting)) return;
      activated = true;
      observerRef.current?.disconnect();
      onNear();
    },
    { rootMargin: MAP_ROOT_MARGIN },
  );
  observerRef.current = observer;

  if (activated || disposed) {
    observer.disconnect();
  } else {
    observer.observe(target);
  }

  return () => {
    disposed = true;
    observerRef.current?.disconnect();
  };
}

export function scheduleIdlePreload(callback: () => void, env: DeferredMapEnvironment) {
  let disposed = false;
  let ran = false;
  const runOnce = () => {
    if (disposed || ran) return;
    ran = true;
    callback();
  };

  if (env.requestIdle && env.cancelIdle) {
    const id = env.requestIdle(runOnce, { timeout: MAP_IDLE_TIMEOUT_MS });
    return () => {
      disposed = true;
      env.cancelIdle?.(id);
    };
  }

  const id = env.setTimer(runOnce, MAP_IDLE_TIMEOUT_MS);
  return () => {
    disposed = true;
    env.clearTimer(id);
  };
}

type BrowserWindow = Window & {
  requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

export function createBrowserDeferredMapEnvironment(): DeferredMapEnvironment {
  if (typeof window === "undefined") {
    return {
      setTimer: () => 0,
      clearTimer: () => {},
    };
  }

  const browserWindow = window as BrowserWindow;
  return {
    createObserver:
      typeof IntersectionObserver === "undefined"
        ? undefined
        : (callback, options) => {
            const observer = new IntersectionObserver(
              (entries) =>
                callback(entries.map((entry) => ({ isIntersecting: entry.isIntersecting }))),
              options,
            );
            return {
              observe: (target) => observer.observe(target),
              disconnect: () => observer.disconnect(),
            };
          },
    requestIdle: browserWindow.requestIdleCallback?.bind(browserWindow),
    cancelIdle: browserWindow.cancelIdleCallback?.bind(browserWindow),
    setTimer: (callback, delay) => window.setTimeout(callback, delay),
    clearTimer: (id) => window.clearTimeout(id),
  };
}
