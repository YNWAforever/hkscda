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

  test("does not activate from a queued observer callback after cleanup", () => {
    let observerCallback: ((entries: Array<{ isIntersecting: boolean }>) => void) | undefined;
    let activations = 0;
    const cleanup = observeNearViewport(
      {} as Element,
      () => {
        activations += 1;
      },
      makeEnvironment({
        createObserver(callback) {
          observerCallback = callback;
          return { observe() {}, disconnect() {} };
        },
      }),
    );

    cleanup();
    observerCallback?.([{ isIntersecting: true }]);

    expect(activations).toBe(0);
  });

  test("handles a synchronous observer callback without an uninitialized handle", () => {
    let activations = 0;
    let observations = 0;
    let disconnects = 0;

    expect(() =>
      observeNearViewport(
        {} as Element,
        () => {
          activations += 1;
        },
        makeEnvironment({
          createObserver(callback) {
            callback([{ isIntersecting: true }]);
            return {
              observe() {
                observations += 1;
              },
              disconnect() {
                disconnects += 1;
              },
            };
          },
        }),
      ),
    ).not.toThrow();
    expect(activations).toBe(1);
    expect(observations).toBe(0);
    expect(disconnects).toBe(1);
  });

  test("runs the idle preload callback once and cancels its handle", () => {
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
    scheduledCallback?.();
    expect(preloads).toBe(1);

    cleanup();
    scheduledCallback?.();
    expect(cancelledId).toBe(17);
    expect(preloads).toBe(1);
  });

  test("prevents a queued idle callback after cleanup", () => {
    let scheduledCallback: (() => void) | undefined;
    let preloads = 0;
    const cleanup = scheduleIdlePreload(
      () => {
        preloads += 1;
      },
      makeEnvironment({
        requestIdle(callback) {
          scheduledCallback = callback;
          return 19;
        },
        cancelIdle() {},
      }),
    );

    cleanup();
    scheduledCallback?.();

    expect(preloads).toBe(0);
  });

  test("runs the literal 2000ms timer fallback once and clears it", () => {
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
    scheduledCallback?.();
    expect(preloads).toBe(1);

    cleanup();
    scheduledCallback?.();
    expect(clearedId).toBe(23);
    expect(preloads).toBe(1);
  });

  test("creates an SSR-safe environment without reading window", () => {
    expect(() => createBrowserDeferredMapEnvironment()).not.toThrow();
  });
});
