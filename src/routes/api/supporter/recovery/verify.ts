import { createFileRoute } from "@tanstack/react-router";

import { createRecoveryVerificationHandler } from "../../../../lib/supporters/recoveryVerify.http.server";
import { createLiveRecoveryBroker } from "../../../../lib/supporters/recoveryRepository.server";
import { enforceRateLimit, getClientIp } from "../../../../lib/security/rate-limit.server";
import { verifyTurnstile } from "../../../../lib/security/turnstile.server";

export const Route = createFileRoute("/api/supporter/recovery/verify")({
  server: {
    handlers: {
      POST: createRecoveryVerificationHandler((request) => {
        const broker = createLiveRecoveryBroker();
        return {
          ip: getClientIp(request),
          rate: (key) =>
            enforceRateLimit(key, {
              prefix: "supporter-recovery-verify",
              max: key.startsWith("ip:") ? 20 : 10,
              window: "1 h",
              requireAvailability: true,
            }),
          challenge: (token, ip) => verifyTurnstile(token, ip),
          verify: (input) => broker.verify(input),
        };
      }),
    },
  },
});
