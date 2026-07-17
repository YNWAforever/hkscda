import { gtagEvent } from "../analytics";
import type { DonationAttribution } from "./attribution";
import {
  donationContexts,
  donationMethods,
  donationPurposes,
  type DonationContext,
  type DonationMethod,
  type DonationPurpose,
} from "./contracts";

export type DonationAnalyticsEvent =
  | "donation_cta_impression"
  | "donation_cta_click"
  | "donation_form_view"
  | "begin_checkout"
  | "donation_success";

export type DonationAnalyticsParams = {
  attribution?: DonationAttribution;
  context?: DonationContext;
  purpose?: DonationPurpose;
  method?: DonationMethod;
  value?: number;
  currency?: string;
};

export type DonationCheckoutSnapshot = {
  context: DonationContext;
  purpose: DonationPurpose;
  method: DonationMethod;
  value: number;
  currency: string;
};

const eventStoragePrefix = "hkscda:donation-event";
const checkoutStoragePrefix = "hkscda:donation-checkout";

function getSessionStorage(): Storage | undefined {
  try {
    return typeof sessionStorage === "undefined" ? undefined : sessionStorage;
  } catch {
    return undefined;
  }
}

function attributionParams(attribution: DonationAttribution) {
  return {
    context: attribution.context,
    purpose: attribution.purpose,
    placement: attribution.placement,
    trigger: attribution.trigger,
  };
}

function controlledContextParams(params: DonationAnalyticsParams) {
  return {
    ...(params.context ? { context: params.context } : {}),
    ...(params.purpose ? { purpose: params.purpose } : {}),
  };
}

export function trackDonationEvent(
  event: DonationAnalyticsEvent,
  params: DonationAnalyticsParams = {},
) {
  const attributionParamsValue = params.attribution
    ? attributionParams(params.attribution)
    : controlledContextParams(params);

  if (event === "begin_checkout" || event === "donation_success") {
    gtagEvent(event, {
      ...attributionParamsValue,
      method: params.method,
      value: params.value,
      currency: params.currency,
    });
    return;
  }

  gtagEvent(event, attributionParamsValue);
}

export function markDonationEventOnce(event: DonationAnalyticsEvent, journeyKey: string): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;

  const key = `${eventStoragePrefix}:${event}:${journeyKey}`;
  try {
    if (storage.getItem(key) !== null) return false;
    storage.setItem(key, "1");
    return true;
  } catch {
    return false;
  }
}

export function saveCheckoutSnapshot(
  donationId: string,
  snapshot: DonationCheckoutSnapshot,
): boolean {
  const storage = getSessionStorage();
  if (!storage) return false;

  try {
    const safeSnapshot: DonationCheckoutSnapshot = {
      context: snapshot.context,
      purpose: snapshot.purpose,
      method: snapshot.method,
      value: snapshot.value,
      currency: snapshot.currency,
    };
    if (!isCheckoutSnapshot(safeSnapshot)) return false;
    storage.setItem(`${checkoutStoragePrefix}:${donationId}`, JSON.stringify(safeSnapshot));
    return true;
  } catch {
    return false;
  }
}

function isCheckoutSnapshot(value: unknown): value is DonationCheckoutSnapshot {
  if (!value || typeof value !== "object") return false;
  const snapshot = value as Record<string, unknown>;
  return (
    typeof snapshot.context === "string" &&
    donationContexts.includes(snapshot.context as DonationContext) &&
    typeof snapshot.purpose === "string" &&
    donationPurposes.includes(snapshot.purpose as DonationPurpose) &&
    typeof snapshot.method === "string" &&
    donationMethods.includes(snapshot.method as DonationMethod) &&
    typeof snapshot.value === "number" &&
    Number.isFinite(snapshot.value) &&
    typeof snapshot.currency === "string" &&
    snapshot.currency.trim().length > 0
  );
}

export function readCheckoutSnapshot(donationId: string): DonationCheckoutSnapshot | undefined {
  const storage = getSessionStorage();
  if (!storage) return undefined;

  try {
    const raw = storage.getItem(`${checkoutStoragePrefix}:${donationId}`);
    if (!raw) return undefined;
    const parsed: unknown = JSON.parse(raw);
    if (!isCheckoutSnapshot(parsed)) return undefined;
    return {
      context: parsed.context,
      purpose: parsed.purpose,
      method: parsed.method,
      value: parsed.value,
      currency: parsed.currency,
    };
  } catch {
    return undefined;
  }
}
