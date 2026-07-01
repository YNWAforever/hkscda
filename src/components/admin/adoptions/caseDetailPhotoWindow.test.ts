import { describe, expect, test } from "bun:test";

import { openPendingPhotoWindow, openSignedPhotoUrl } from "./caseDetailPhotoWindow";

type FakeWindowHandle = {
  opener: unknown;
  location: { href: string };
  close: () => void;
};

describe("case detail photo window helpers", () => {
  test("pre-opens a reusable tab without noopener features and clears opener", () => {
    const calls: Array<Array<string | undefined>> = [];
    const opened: FakeWindowHandle = {
      opener: { source: "admin" },
      location: { href: "" },
      close: () => {},
    };

    const result = openPendingPhotoWindow((...args) => {
      calls.push(args);
      return opened;
    });

    expect(calls).toEqual([["", "_blank"]]);
    expect(opened.opener).toBeNull();
    expect(result).toBe(opened);
  });

  test("reuses the pending tab for the signed photo URL", () => {
    const opened: FakeWindowHandle = {
      opener: null,
      location: { href: "about:blank" },
      close: () => {},
    };
    const calls: Array<Array<string | undefined>> = [];

    openSignedPhotoUrl("https://storage.example/photo", opened, (...args) => {
      calls.push(args);
      return null;
    });

    expect(opened.location.href).toBe("https://storage.example/photo");
    expect(calls).toEqual([]);
  });

  test("falls back to noopener direct open when the pending tab is blocked", () => {
    const calls: Array<Array<string | undefined>> = [];
    const fallback: FakeWindowHandle = {
      opener: { source: "admin" },
      location: { href: "" },
      close: () => {},
    };

    openSignedPhotoUrl("https://storage.example/photo", null, (...args) => {
      calls.push(args);
      return fallback;
    });

    expect(calls).toEqual([["https://storage.example/photo", "_blank", "noopener,noreferrer"]]);
    expect(fallback.opener).toBeNull();
  });
});
