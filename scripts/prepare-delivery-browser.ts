import { SQL } from "bun";
import { readFile, writeFile } from "node:fs/promises";
if (process.env.VOLUNTEER_TEST_ALLOW_LOCAL_FIXTURES !== "1")
  throw Error("Isolated fixture flag required");
const c = JSON.parse(await readFile(".local-policy-test/local-credentials.json", "utf8"));
if (c.API_URL !== "http://127.0.0.1:56321") throw Error("Dedicated stack required");
const db = new SQL("postgresql://postgres:postgres@127.0.0.1:56322/postgres", {
  max: 1,
  prepare: false,
});
try {
  const marker = crypto.randomUUID(),
    messageId = crypto.randomUUID();
  const [job] =
    await db`insert into public.volunteer_operation_outbox(dedup_key,kind,payload,status) values(${marker},'volunteer_monthly_assessment_notification',${JSON.stringify({ providerMessageId: messageId, dry_run: true })}::jsonb,'provider_accepted') returning id`;
  await writeFile(
    ".local-policy-test/browser/delivery-fixture.json",
    JSON.stringify({ marker, messageId, jobId: job.id }),
  );
} finally {
  await db.close();
}
