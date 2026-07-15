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
  const observer = env.createObserver(
    (entries) => {
      if (activated || !entries.some((entry) => entry.isIntersecting)) return;
      activated = true;
      observer.disconnect();
      onNear();
    },
    { rootMargin: MAP_ROOT_MARGIN },
  );
  observer.observe(target);
  return () => observer.disconnect();
}

export function scheduleIdlePreload(callback: () => void, env: DeferredMapEnvironment) {
  if (env.requestIdle && env.cancelIdle) {
    const id = env.requestIdle(callback, { timeout: MAP_IDLE_TIMEOUT_MS });
    return () => env.cancelIdle?.(id);
  }

  const id = env.setTimer(callback, MAP_IDLE_TIMEOUT_MS);
  return () => env.clearTimer(id);
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
