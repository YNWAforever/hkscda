import { createHash } from "node:crypto";

import { getAppUrl, getCodConfig, type CodConfig } from "./config.server";
import { createCodClient, type CodCreateOrderInput } from "./cod-client.server";
import type { CheckoutProviderInput, CheckoutProviderResult } from "./service";

const COD_SUBJECT = "HKSCDA Donation 香港拯救貓狗協會捐款";

export function createCodOrderReference(paymentId: string) {
  return `hkscda-${createHash("sha256").update(paymentId).digest("hex").slice(0, 48)}`;
}

type CodProviderDependencies = {
  config?: CodConfig;
  createClient?: () => Pick<ReturnType<typeof createCodClient>, "createOrder">;
};

function toPaymentSolution(checkoutExperience: CheckoutProviderInput["checkoutExperience"]) {
  return checkoutExperience === "wap" ? "WAP" : "PC2MOBILE";
}

function createReturnUrl(donationId: string) {
  const url = new URL("/donate", getAppUrl());
  url.searchParams.set("status", "pending");
  url.searchParams.set("donation", donationId);
  return url.toString();
}

function composeHostedUrl(url: string, alipayOrderString: string) {
  let hostedUrl: URL;
  try {
    hostedUrl = new URL(url);
  } catch {
    throw new Error("COD did not return an absolute HTTPS hosted URL");
  }
  if (hostedUrl.protocol !== "https:") {
    throw new Error("COD did not return an absolute HTTPS hosted URL");
  }
  if (hostedUrl.hash) {
    throw new Error("COD hosted URL must not contain a fragment");
  }
  return `${url}${url.includes("?") ? "&" : "?"}${alipayOrderString}`;
}

export async function createCodAlipayHkCheckout(
  input: CheckoutProviderInput,
  dependencies: CodProviderDependencies = {},
): Promise<CheckoutProviderResult> {
  const config = dependencies.config ?? getCodConfig();
  const client = dependencies.createClient?.() ?? createCodClient({ config });
  const order: CodCreateOrderInput = {
    orderRef: createCodOrderReference(input.paymentId),
    amount: Number((input.amountCents / 100).toFixed(2)),
    subject: COD_SUBJECT,
    returnUrl: createReturnUrl(input.donationId),
    paymentSolution: toPaymentSolution(input.checkoutExperience),
  };
  const response = await client.createOrder(order);

  return {
    providerRef: response.outTradeNo,
    providerOrderRef: order.orderRef,
    url: composeHostedUrl(response.url, response.alipayOrderString),
  };
}
