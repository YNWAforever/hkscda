import { describe, expect, test } from "bun:test";

import {
  createBrowserDeferredMapEnvironment,
  observeNearViewport,
  scheduleIdlePreload,
  type DeferredMapEnvironment,
} from "./deferredMapScheduling";

function makeEnvironment(overrides: Partial<DeferredMapEnvironment> = {}): DeferredMapEnvironment {
  return {
    setTimer: () => 1,
    clearTimer: () => {},
    ...overrides,
  };
}

describe("deferred map scheduling", () => {
  test("activates once within the literal 600px viewport margin and cleans up", () => {
    let observerCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    let observedTarget: Element | undefined;
    let disconnects = 0;
    let activations = 0;
    const target = {} as Element;
    const environment = makeEnvironment({
      createObserver(callback, options) {
        observerCallback = callback;
        expect(options).toEqual({ rootMargin: "600px" });
        return {
          observe(nextTarget) {
            observedTarget = nextTarget;
          },
          disconnect() {
            disconnects += 1;
          },
        };
      },
    });

    const cleanup = observeNearViewport(
      target,
      () => {
        activations += 1;
      },
      environment,
    );

    observerCallback?.([{ isIntersecting: false }]);
    observerCallback?.([{ isIntersecting: true }]);
    observerCallback?.([{ isIntersecting: true }]);

    expect(observedTarget).toBe(target);
    expect(activations).toBe(1);
    expect(disconnects).toBe(1);

    cleanup();
    expect(disconnects).toBe(2);
  });

  test("activates immediately when IntersectionObserver is unavailable", () => {
    let activations = 0;
    const cleanup = observeNearViewport(
      {} as Element,
      () => {
        activations += 1;
      },
      makeEnvironment(),
    );

    expect(activations).toBe(1);
    expect(cleanup()).toBeUndefined();
  });

  test("runs the idle preload callback and cancels its handle", () => {
    let scheduledCallback: (() => void) | undefined;
    let cancelledId: number | undefined;
    let preloads = 0;
    const environment = makeEnvironment({
      requestIdle(callback, options) {
        scheduledCallback = callback;
        expect(options).toEqual({ timeout: 2000 });
        return 17;
      },
      cancelIdle(id) {
        cancelledId = id;
      },
    });

    const cleanup = scheduleIdlePreload(() => {
      preloads += 1;
    }, environment);

    expect(preloads).toBe(0);
    scheduledCallback?.();
    expect(preloads).toBe(1);

    cleanup();
    expect(cancelledId).toBe(17);
  });

  test("runs the literal 2000ms timer fallback and clears it", () => {
    let scheduledCallback: (() => void) | undefined;
    let clearedId: number | undefined;
    let preloads = 0;
    const environment = makeEnvironment({
      setTimer(callback, delay) {
        scheduledCallback = callback;
        expect(delay).toBe(2000);
        return 23;
      },
      clearTimer(id) {
        clearedId = id;
      },
    });

    const cleanup = scheduleIdlePreload(() => {
      preloads += 1;
    }, environment);

    expect(preloads).toBe(0);
    scheduledCallback?.();
    expect(preloads).toBe(1);

    cleanup();
    expect(clearedId).toBe(23);
  });

  test("creates an SSR-safe environment without reading window", () => {
    expect(() => createBrowserDeferredMapEnvironment()).not.toThrow();
  });
});
