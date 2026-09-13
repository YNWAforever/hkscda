import { expect, test } from "bun:test";
import { createSponsorshipCron } from "./cron.server";
test("sponsorship cron rejects unauthorized before creating provider or database", async () => {
  let calls = 0;
  const run = createSponsorshipCron({
    secret: () => "synthetic-secret",
    actor: () => "synthetic-actor",
    run: async () => {
      calls++;
      return { status: "queued" };
    },
  });
  expect((await run(new Request("https://example.invalid"))).status).toBe(401);
  expect(calls).toBe(0);
  const result = await run(
    new Request("https://example.invalid", {
      headers: { authorization: "Bearer synthetic-secret" },
    }),
  );
  expect(await result.json()).toEqual({ status: "queued" });
  expect(calls).toBe(1);
});
test("missing job actor remains disabled without claiming outbox", async () => {
  const run = createSponsorshipCron({
    secret: () => "synthetic-secret",
    actor: () => undefined,
    run: async () => {
      throw Error("must not run");
    },
  });
  expect(
    await (
      await run(
        new Request("https://example.invalid", {
          headers: { authorization: "Bearer synthetic-secret" },
        }),
      )
    ).json(),
  ).toEqual({ status: "disabled", reason: "job_actor_unconfigured" });
});
