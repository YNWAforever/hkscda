import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  scheduleDeferredMapPreload,
  type DeferredMapPreloadHandle,
} from "./deferredMapScheduling";

describe("scheduleDeferredMapPreload", () => {
  const savedIntersectionObserver = globalThis.IntersectionObserver;
  const savedRequestIdleCallback = globalThis.requestIdleCallback;
  const savedCancelIdleCallback = globalThis.cancelIdleCallback;
  const savedSetTimeout = globalThis.setTimeout;
  const savedClearTimeout = globalThis.clearTimeout;

  beforeEach(() => vi.restoreAllMocks());

  afterEach(() => {
    globalThis.IntersectionObserver = savedIntersectionObserver;
    globalThis.requestIdleCallback = savedRequestIdleCallback;
    globalThis.cancelIdleCallback = savedCancelIdleCallback;
    globalThis.setTimeout = savedSetTimeout;
    globalThis.clearTimeout = savedClearTimeout;
  });

  it("registers the observer with the required preload margin", () => {
    const observe = vi.fn();
    const disconnect = vi.fn();
    const Observer = vi.fn(function (this: IntersectionObserver) {
      Object.assign(this, { observe, disconnect });
    });
    globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;

    scheduleDeferredMapPreload(vi.fn());

    expect(Observer).toHaveBeenCalledWith(expect.any(Function), {
      rootMargin: "600px",
    });
    expect(observe).toHaveBeenCalledTimes(1);
  });

  it("cancels the observer registration", () => {
    const disconnect = vi.fn();
    const Observer = vi.fn(function (this: IntersectionObserver) {
      Object.assign(this, { observe: vi.fn(), disconnect });
    });
    globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;

    const handle = scheduleDeferredMapPreload(vi.fn());
    handle.cancel();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("runs the captured idle callback exactly once", () => {
    const preload = vi.fn();
    let scheduledCallback: IdleRequestCallback | undefined;
    globalThis.requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      scheduledCallback = callback;
      return 17;
    });
    globalThis.cancelIdleCallback = vi.fn();

    const handle: DeferredMapPreloadHandle = scheduleDeferredMapPreload(preload);
    expect(preload).not.toHaveBeenCalled();

    scheduledCallback?.({ didTimeout: false, timeRemaining: () => 50 });

    expect(preload).toHaveBeenCalledTimes(1);
    handle.cancel();
    expect(globalThis.cancelIdleCallback).toHaveBeenCalledWith(17);
  });

  it("uses the timer fallback and runs the captured callback exactly once", () => {
    const preload = vi.fn();
    let scheduledCallback: (() => void) | undefined;
    globalThis.requestIdleCallback = undefined;
    globalThis.cancelIdleCallback = undefined;
    globalThis.setTimeout = vi.fn((callback: () => void, delay?: number) => {
      scheduledCallback = callback;
      expect(delay).toBe(2000);
      return 23 as unknown as ReturnType<typeof setTimeout>;
    }) as unknown as typeof setTimeout;
    globalThis.clearTimeout = vi.fn() as unknown as typeof clearTimeout;

    const handle = scheduleDeferredMapPreload(preload);
    expect(preload).not.toHaveBeenCalled();

    scheduledCallback?.();

    expect(preload).toHaveBeenCalledTimes(1);
    handle.cancel();
    expect(globalThis.clearTimeout).toHaveBeenCalledWith(23);
  });

  it("disconnects the observer after an intersecting entry", () => {
    const preload = vi.fn();
    const disconnect = vi.fn();
    let observerCallback: IntersectionObserverCallback | undefined;
    const Observer = vi.fn(function (
      this: IntersectionObserver,
      callback: IntersectionObserverCallback,
    ) {
      observerCallback = callback;
      Object.assign(this, { observe: vi.fn(), disconnect });
    });
    globalThis.IntersectionObserver = Observer as unknown as typeof IntersectionObserver;
    globalThis.requestIdleCallback = vi.fn(() => 31);
    globalThis.cancelIdleCallback = vi.fn();

    scheduleDeferredMapPreload(preload);
    observerCallback?.(
      [{ isIntersecting: true } as IntersectionObserverEntry],
      {} as IntersectionObserver,
    );

    expect(disconnect).toHaveBeenCalledTimes(1);
  });

  it("does not preload after cancellation", () => {
    const preload = vi.fn();
    let scheduledCallback: IdleRequestCallback | undefined;
    globalThis.requestIdleCallback = vi.fn((callback: IdleRequestCallback) => {
      scheduledCallback = callback;
      return 41;
    });
    globalThis.cancelIdleCallback = vi.fn();

    const handle = scheduleDeferredMapPreload(preload);
    handle.cancel();
    scheduledCallback?.({ didTimeout: false, timeRemaining: () => 50 });

    expect(preload).not.toHaveBeenCalled();
  });
});
