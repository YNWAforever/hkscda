import { readBoundedText } from "../http/boundedBody.server";

const MAX_PAYMENT_WEBHOOK_BYTES = 2 * 1024 * 1024;

export function readPaymentWebhookBody(request: Request): Promise<string | null> {
  return readBoundedText(request, MAX_PAYMENT_WEBHOOK_BYTES);
}
