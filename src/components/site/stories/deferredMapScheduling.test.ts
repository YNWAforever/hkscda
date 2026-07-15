import { describe, expect, test } from "bun:test";

import {
  MAP_IDLE_TIMEOUT_MS,
  MAP_ROOT_MARGIN,
  observeNearViewport,
  scheduleIdlePreload,
} from "./deferredMapScheduling";

type ObserverCallback = (entries: Array<{ isIntersecting: boolean }>) => void;

describe("observeNearViewport", () => {
  test("observes with a 600px root margin, activates once, and disconnects", () => {
    const target = {} as Element;
    let callback: ObserverCallback | undefined;
    let observedTarget: Element | undefined;
    let disconnectCount = 0;

    const cleanup = observeNearViewport(
      target,
      () => {
        activationCount += 1;
      },
      {
        createObserver: (observerCallback, options) => {
          callback = observerCallback;
          expect(options.rootMargin).toBe(MAP_ROOT_MARGIN);
          return {
            observe: (observed) => {
              observedTarget = observed;
            },
            disconnect: () => {
              disconnectCount += 1;
            },
          };
        },
        setTimer: () => 0,
        clearTimer: () => {},
      },
    );
    let activationCount = 0;

    expect(observedTarget).toBe(target);
    callback?.([{ isIntersecting: false }]);
    expect(activationCount).toBe(0);
    callback?.([{ isIntersecting: true }, { isIntersecting: true }]);
    callback?.([{ isIntersecting: true }]);
    expect(activationCount).toBe(1);
    expect(disconnectCount).toBe(1);

    cleanup();
    expect(disconnectCount).toBe(2);
  });

  test("activates immediately when observers are unavailable", () => {
    let activationCount = 0;

    const cleanup = observeNearViewport(
      {} as Element,
      () => {
        activationCount += 1;
      },
      {
        setTimer: () => 0,
        clearTimer: () => {},
      },
    );

    cleanup();
    expect(activationCount).toBe(1);
  });
});

describe("scheduleIdlePreload", () => {
  test("uses an idle callback with a 2000ms timeout and cancels it", () => {
    let scheduledCallback: (() => void) | undefined;
    let scheduledTimeout = 0;
    let cancelledId = 0;

    const cleanup = scheduleIdlePreload(() => {}, {
      requestIdle: (callback, options) => {
        scheduledCallback = callback;
        scheduledTimeout = options.timeout;
        return 7;
      },
      cancelIdle: (id) => {
        cancelledId = id;
      },
      setTimer: () => 0,
      clearTimer: () => {},
    });

    expect(scheduledCallback).toBeDefined();
    expect(scheduledTimeout).toBe(MAP_IDLE_TIMEOUT_MS);
    cleanup();
    expect(cancelledId).toBe(7);
  });

  test("uses and clears a 2000ms timer when idle callbacks are unavailable", () => {
    let timerCallback: (() => void) | undefined;
    let timerDelay = 0;
    let clearedId = 0;

    const cleanup = scheduleIdlePreload(() => {}, {
      setTimer: (callback, delay) => {
        timerCallback = callback;
        timerDelay = delay;
        return 11;
      },
      clearTimer: (id) => {
        clearedId = id;
      },
    });

    expect(timerCallback).toBeDefined();
    expect(timerDelay).toBe(MAP_IDLE_TIMEOUT_MS);
    cleanup();
    expect(clearedId).toBe(11);
  });
});
