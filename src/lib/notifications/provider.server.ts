export type ProviderResult =
  | { kind: "accepted"; providerMessageId: string }
  | { kind: "rejected"; code: string; retryable: boolean };

export type MailInput = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  idempotencyKey: string;
};

export interface MailProvider {
  send(input: MailInput): Promise<ProviderResult>;
}

export type ResendTransport = (input: MailInput) => Promise<{
  data: { id: string } | null;
  error: { name: string } | null;
}>;

const permanentRejectionCodes = new Set([
  "invalid_access",
  "invalid_from_address",
  "invalid_parameter",
  "missing_required_field",
  "restricted_api_key",
  "validation_error",
]);

function rejected(code: string): ProviderResult {
  return { kind: "rejected", code, retryable: !permanentRejectionCodes.has(code) };
}

export function createResendMailProvider(send: ResendTransport): MailProvider {
  return {
    async send(input) {
      let response: Awaited<ReturnType<ResendTransport>>;
      try {
        response = await send(input);
      } catch {
        return rejected("transport_error");
      }
      if (response.error) return rejected(response.error.name || "provider_error");
      if (!response.data?.id) return rejected("missing_provider_message_id");
      return { kind: "accepted", providerMessageId: response.data.id };
    },
  };
}
