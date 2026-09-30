import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { Resend } from "resend";

import { getEmailConfig } from "../donations/config.server";
import { createResendMailProvider } from "../notifications/provider.server";
import { createSupabaseServiceClient } from "../supabase.server";
import {
  createRecoveryBroker,
  parseRecoveryTokenKey,
  type RecoveryCarrierProvider,
  type RecoveryChallengeRepository,
} from "./recoveryBroker.server";
import { RecoveryError } from "./recovery.server";

export function createSupabaseRecoveryRepository(
  client: SupabaseClient,
): RecoveryChallengeRepository {
  return {
    async put(input) {
      const { error } = await client.rpc("create_supporter_recovery_challenge", {
        p_id: input.id,
        p_auth_user_id: input.userId,
        p_email_fingerprint: input.emailFingerprint,
        p_code_fingerprint: input.codeFingerprint,
        p_sealed_carrier: input.sealedCarrier,
      });
      if (error) throw error;
    },
    async consume(input) {
      const { data, error } = await client.rpc("consume_supporter_recovery_challenge", {
        p_id: input.id,
        p_email_fingerprint: input.emailFingerprint,
        p_code_fingerprint: input.codeFingerprint,
      });
      if (error) throw error;
      if (data === null) return null;
      return z
        .object({ userId: z.string().uuid(), sealedCarrier: z.string().min(40).max(4096) })
        .parse(data);
    },
    async invalidate(id) {
      const { error } = await client.rpc("invalidate_supporter_recovery_challenge", { p_id: id });
      if (error) throw error;
    },
  };
}

export function createSupabaseRecoveryCarrierProvider(
  client: () => SupabaseClient,
): RecoveryCarrierProvider {
  return {
    async generate(email) {
      const { data, error } = await client().auth.admin.generateLink({ type: "magiclink", email });
      if (error || !data.user || !data.properties || !data.user.email)
        throw new RecoveryError("unavailable");
      const type = data.properties.verification_type;
      if (type !== "magiclink" && type !== "signup") throw new RecoveryError("unavailable");
      return {
        userId: data.user.id,
        email: data.user.email,
        tokenHash: data.properties.hashed_token,
        type,
      };
    },
    async exchange(carrier) {
      // New client per exchange: never replace the service repository's bearer with a user session.
      const { data, error } = await client().auth.verifyOtp({
        token_hash: carrier.tokenHash,
        type: carrier.type,
      });
      if (error || !data.session || !data.user?.email) throw new RecoveryError("invalid_code");
      return {
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        userId: data.user.id,
        email: data.user.email,
        verified: Boolean(data.user.email_confirmed_at),
      };
    },
  };
}

export function createLiveRecoveryBroker() {
  const key = parseRecoveryTokenKey(process.env.SUPPORTER_RECOVERY_TOKEN_KEY);
  const config = getEmailConfig();
  if (!config.resendApiKey) throw new RecoveryError("unavailable");
  const resend = new Resend(config.resendApiKey);
  return createRecoveryBroker({
    key,
    repository: createSupabaseRecoveryRepository(createSupabaseServiceClient()),
    carrier: createSupabaseRecoveryCarrierProvider(createSupabaseServiceClient),
    from: config.from,
    replyTo: config.replyTo,
    mail: createResendMailProvider(async ({ idempotencyKey, ...email }) => {
      const result = await resend.emails.send(email, { idempotencyKey });
      return {
        data: result.data ? { id: result.data.id } : null,
        error: result.error ? { name: result.error.name } : null,
      };
    }),
  });
}
