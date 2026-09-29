import { afterEach, expect, test } from "bun:test";
import { createRecoveryRouteHandler } from "./recovery";

const original = process.env.SUPPORTER_RECOVERY_ENABLED;
afterEach(() => {
  if (original === undefined) delete process.env.SUPPORTER_RECOVERY_ENABLED;
  else process.env.SUPPORTER_RECOVERY_ENABLED = original;
});

for (const setting of [undefined, "false", "TRUE"]) {
  test(`recovery never sends OTP before explicit activation (${setting})`, async () => {
    if (setting === undefined) delete process.env.SUPPORTER_RECOVERY_ENABLED;
    else process.env.SUPPORTER_RECOVERY_ENABLED = setting;
    let dependenciesCreated = 0;
    let sends = 0;
    const handle = createRecoveryRouteHandler(() => {
      dependenciesCreated++;
      return {
        ip: "203.0.113.4",
        rate: async () => ({ ok: true }),
        challenge: async () => true,
        sendOtp: async () => {
          sends++;
        },
      };
    });
    const response = await handle({
      request: new Request("https://example.invalid/api/supporter/recovery", {
        method: "POST",
        body: JSON.stringify({ email: "synthetic@example.invalid" }),
      }),
    });
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(dependenciesCreated).toBe(0);
    expect(sends).toBe(0);
  });
}
