import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Static rendering never runs effects, so collect them and run them by hand. Bun has no
// DOM here, so `document` and `window` are small stand-ins for what the effects touch.
type Effect = () => void | (() => void);
let effects: Effect[] = [];
mock.module("react", () => ({
  ...React,
  useEffect: (effect: Effect) => {
    effects.push(effect);
  },
}));

const { AdminLanguageProvider } = await import("./adminI18n");

type Globals = { document?: unknown; window?: unknown };
const globals = globalThis as unknown as Globals;
let html: { lang: string };
let storageReads: string[];
let stored: string | null;

function mount(initialLanguage?: "zh" | "en") {
  effects = [];
  renderToStaticMarkup(
    <AdminLanguageProvider initialLanguage={initialLanguage}>
      <p>page</p>
    </AdminLanguageProvider>,
  );
  const cleanups = effects.map((effect) => effect());
  return () => cleanups.forEach((cleanup) => (typeof cleanup === "function" ? cleanup() : null));
}

beforeEach(() => {
  html = { lang: "zh-Hant" };
  storageReads = [];
  stored = null;
  globals.document = { documentElement: html };
  globals.window = {
    localStorage: {
      getItem: (key: string) => {
        storageReads.push(key);
        return stored;
      },
      setItem: () => {},
    },
  };
});

afterEach(() => {
  delete globals.document;
  delete globals.window;
});

describe("AdminLanguageProvider effects", () => {
  test("sets the page language on <html> while mounted and puts the old one back", () => {
    const unmount = mount("en");
    expect(html.lang).toBe("en");
    unmount();
    expect(html.lang).toBe("zh-Hant");
  });

  test("tags a Chinese admin as zh-HK", () => {
    const unmount = mount("zh");
    expect(html.lang).toBe("zh-HK");
    unmount();
    expect(html.lang).toBe("zh-Hant");
  });

  test("a fixed initial language does not read the stored preference", () => {
    mount("en");
    expect(storageReads).toEqual([]);
  });

  test("without an initial language the stored preference is read", () => {
    stored = "en";
    mount();
    expect(storageReads).toEqual(["hkscda-admin-language"]);
  });

  test("a provider inside another one adds no effects of its own", () => {
    effects = [];
    renderToStaticMarkup(
      <AdminLanguageProvider initialLanguage="en">
        <AdminLanguageProvider initialLanguage="zh">
          <p>page</p>
        </AdminLanguageProvider>
      </AdminLanguageProvider>,
    );
    const outerOnly = effects.length;
    effects = [];
    renderToStaticMarkup(
      <AdminLanguageProvider initialLanguage="en">
        <p>page</p>
      </AdminLanguageProvider>,
    );
    expect(outerOnly).toBe(effects.length);
  });
});
