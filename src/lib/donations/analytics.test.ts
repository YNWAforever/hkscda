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

Object.defineProperty(globalThis, "sessionStorage", {
  configurable: true,
  value: sessionStorageMock,
});

const attribution = {
  source: "contextual-cta" as const,
  context: "story" as const,
  purpose: "general" as const,
  placement: "mobile-bottom" as const,
  trigger: "scroll" as const,
};

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
    sessionStorage.clear();
    expect(markDonationEventOnce("donation_cta_impression", "journey-1")).toBe(true);
    expect(markDonationEventOnce("donation_cta_impression", "journey-1")).toBe(false);
    expect(markDonationEventOnce("donation_cta_impression", "journey-2")).toBe(true);
  });

  test("round-trips an analytics-safe checkout snapshot", () => {
    sessionStorage.clear();
    const snapshot = {
      context: "story" as const,
      purpose: "general" as const,
      method: "stripe" as const,
      value: 250,
      currency: "HKD",
    };
    expect(saveCheckoutSnapshot("donation-1", snapshot)).toBe(true);
    expect(readCheckoutSnapshot("donation-1")).toEqual(snapshot);
    expect(readCheckoutSnapshot("missing")).toBeUndefined();
  });
});
