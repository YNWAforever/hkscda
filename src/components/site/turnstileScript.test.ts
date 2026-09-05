import { describe, expect, test } from "bun:test";

import {
  clearTurnstileScriptFailure,
  loadTurnstileScript,
  TURNSTILE_SCRIPT_SRC,
} from "./turnstileScript";

type FakeScript = {
  dataset: Record<string, string>;
  src: string;
  async?: boolean;
  defer?: boolean;
  addEventListener(type: string, callback: () => void): void;
  dispatch(type: string): void;
  remove(): void;
};

function fakeBrowser() {
  let current: FakeScript | null = null;
  const scripts: FakeScript[] = [];
  const createScript = () => {
    const listeners = new Map<string, () => void>();
    const script: FakeScript = {
      dataset: {},
      src: "",
      addEventListener(type, callback) {
        listeners.set(type, callback);
      },
      dispatch(type) {
        listeners.get(type)?.();
      },
      remove() {
        if (current === script) current = null;
      },
    };
    scripts.push(script);
    return script;
  };
  const documentRef = {
    querySelector() {
      return current;
    },
    createElement() {
      return createScript();
    },
    head: {
      appendChild(script: FakeScript) {
        current = script;
      },
    },
  } as unknown as Document;
  return { documentRef, windowRef: {} as Window, scripts };
}

describe("Turnstile script recovery", () => {
  test("removes a failed cached script and succeeds on retry without duplicates", async () => {
    const browser = fakeBrowser();
    const first = loadTurnstileScript(browser.windowRef, browser.documentRef);
    expect(browser.scripts).toHaveLength(1);
    expect(browser.scripts[0].src).toBe(TURNSTILE_SCRIPT_SRC);
    browser.scripts[0].dispatch("error");
    await expect(first).rejects.toThrow("Failed to load Turnstile");

    clearTurnstileScriptFailure(browser.documentRef);
    const second = loadTurnstileScript(browser.windowRef, browser.documentRef);
    expect(browser.scripts).toHaveLength(2);
    browser.scripts[1].dispatch("load");
    await expect(second).resolves.toBeUndefined();

    const shared = loadTurnstileScript(browser.windowRef, browser.documentRef);
    expect(browser.scripts).toHaveLength(2);
    await expect(shared).resolves.toBeUndefined();
  });
});
