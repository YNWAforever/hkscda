import { describe, expect, spyOn, test } from "bun:test";
import * as baseAnalytics from "../analytics";
import {
  markDonationEventOnce,
  readCheckoutSnapshot,
  saveCheckoutSnapshot,
  trackDonationEvent,
} from "./analytics";

const sessionValues = new Map<string, string>();
const sessionStorageMock = {
  clear: () => sessionValues.clear(),
  getItem: (key: string) => sessionValues.get(key) ?? null,
  setItem: (key: string, value: string) => sessionValues.set(key, value),
};

function installSessionStorage(value: unknown) {
  Object.defineProperty(globalThis, "sessionStorage", {
    configurable: true,
    value,
  });
}

installSessionStorage(sessionStorageMock);

const attribution = {
  source: "contextual-cta" as const,
  context: "story" as const,
  purpose: "general" as const,
  placement: "mobile-bottom" as const,
  trigger: "scroll" as const,
};

const checkoutSnapshot = {
  context: "story" as const,
  purpose: "general" as const,
  method: "stripe" as const,
  value: 250,
  currency: "HKD",
};

const checkoutKey = "hkscda:donation-checkout:donation-1";

describe("donation analytics", () => {
  test("sends only controlled non-PII parameters", () => {
    const spy = spyOn(baseAnalytics, "gtagEvent");
    trackDonationEvent("donation_cta_click", {
      attribution,
      journeyKey: "private-journey",
      donationId: "donation-secret",
      name: "A Person",
    } as never);
    expect(spy.mock.calls[0]?.[1]).toEqual({
      context: "story",
      purpose: "general",
      placement: "mobile-bottom",
      trigger: "scroll",
    });
    expect(spy.mock.calls[0]?.[1]).not.toHaveProperty("donation_id");
    expect(spy.mock.calls[0]?.[1]).not.toHaveProperty("page_path");
    spy.mockRestore();
  });

  test("marks an event only once per session journey", () => {
    installSessionStorage(sessionStorageMock);
    sessionStorage.clear();
    expect(markDonationEventOnce("donation_cta_impression", "journey-1")).toBe(true);
    expect(markDonationEventOnce("donation_cta_impression", "journey-1")).toBe(false);
    expect(markDonationEventOnce("donation_cta_impression", "journey-2")).toBe(true);
  });

  test("round-trips an analytics-safe checkout snapshot", () => {
    installSessionStorage(sessionStorageMock);
    sessionStorage.clear();
    expect(saveCheckoutSnapshot("donation-1", checkoutSnapshot)).toBe(true);
    expect(readCheckoutSnapshot("donation-1")).toEqual(checkoutSnapshot);
    expect(readCheckoutSnapshot("missing")).toBeUndefined();
  });

  test.each([
    ["context", { context: "unknown" }],
    ["purpose", { purpose: "unknown" }],
    ["method", { method: "unknown" }],
    ["value", { value: Number.NaN }],
    ["currency", { currency: "   " }],
  ])("rejects invalid checkout %s before persisting", (_field, invalidField) => {
    installSessionStorage(sessionStorageMock);
    sessionStorage.clear();

    expect(
      saveCheckoutSnapshot("donation-1", {
        ...checkoutSnapshot,
        ...invalidField,
      } as never),
    ).toBe(false);
    expect(sessionStorage.getItem(checkoutKey)).toBeNull();
  });

  test("does not persist or return extra checkout fields", () => {
    installSessionStorage(sessionStorageMock);
    sessionStorage.clear();
    expect(
      saveCheckoutSnapshot("donation-1", {
        ...checkoutSnapshot,
        email: "private@example.com",
      } as never),
    ).toBe(true);
    expect(JSON.parse(sessionStorage.getItem(checkoutKey)!)).toEqual(checkoutSnapshot);
    expect(readCheckoutSnapshot("donation-1")).toEqual(checkoutSnapshot);
  });

  test("rejects malformed checkout snapshots", () => {
    installSessionStorage(sessionStorageMock);
    sessionStorage.clear();
    sessionStorageMock.setItem(checkoutKey, "{not-json");
    expect(readCheckoutSnapshot("donation-1")).toBeUndefined();
    sessionStorageMock.setItem(checkoutKey, JSON.stringify({ ...checkoutSnapshot, value: null }));
    expect(readCheckoutSnapshot("donation-1")).toBeUndefined();
    sessionStorageMock.setItem(checkoutKey, JSON.stringify({ ...checkoutSnapshot, currency: " " }));
    expect(readCheckoutSnapshot("donation-1")).toBeUndefined();
  });

  test("handles unavailable and throwing session storage", () => {
    installSessionStorage(undefined);
    expect(markDonationEventOnce("donation_cta_impression", "journey-1")).toBe(false);
    expect(saveCheckoutSnapshot("donation-1", checkoutSnapshot)).toBe(false);
    expect(readCheckoutSnapshot("donation-1")).toBeUndefined();

    installSessionStorage({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });
    expect(markDonationEventOnce("donation_cta_impression", "journey-1")).toBe(false);
    expect(saveCheckoutSnapshot("donation-1", checkoutSnapshot)).toBe(false);
    expect(readCheckoutSnapshot("donation-1")).toBeUndefined();

    installSessionStorage(sessionStorageMock);
  });
});
