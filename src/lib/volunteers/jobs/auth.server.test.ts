import { expect, mock, test } from "bun:test";
import { authorizedCron, createMissingCronSecretReporter } from "./auth.server";

function requestWith(authorization?: string): Request {
  return new Request("https://x", authorization ? { headers: { authorization } } : undefined);
}

test("a missing, empty or whitespace secret is rejected and reported on every call", () => {
  const reportMissing = mock(() => {});
  for (const secret of [undefined, "", "  \n"]) {
    expect(authorizedCron(requestWith("Bearer s3cret"), secret, reportMissing)).toBe(false);
  }
  expect(reportMissing).toHaveBeenCalledTimes(3);
});

test("the exact bearer token passes without reporting", () => {
  const reportMissing = mock(() => {});
  expect(authorizedCron(requestWith("Bearer s3cret"), "s3cret", reportMissing)).toBe(true);
  expect(authorizedCron(requestWith("bearer s3cret"), "s3cret", reportMissing)).toBe(true);
  expect(reportMissing).toHaveBeenCalledTimes(0);
});

test("a secret saved with surrounding whitespace still matches", () => {
  const reportMissing = mock(() => {});
  expect(authorizedCron(requestWith("Bearer s3cret"), "  s3cret\n", reportMissing)).toBe(true);
  expect(reportMissing).toHaveBeenCalledTimes(0);
});

test("a wrong, short or absent token fails without reporting", () => {
  const reportMissing = mock(() => {});
  expect(authorizedCron(requestWith("Bearer s3creT"), "s3cret", reportMissing)).toBe(false);
  expect(authorizedCron(requestWith("Bearer s3"), "s3cret", reportMissing)).toBe(false);
  expect(authorizedCron(requestWith(), "s3cret", reportMissing)).toBe(false);
  expect(reportMissing).toHaveBeenCalledTimes(0);
});

test("the reporter logs the exact message once in production", () => {
  const messages: string[] = [];
  const report = createMissingCronSecretReporter({
    isProduction: () => true,
    log: (message) => messages.push(message),
  });
  report();
  report();
  report();
  expect(messages).toEqual([
    "CRON_SECRET is not set in production: scheduled job requests are rejected with 401, so no background job runs. See docs/background-jobs-runbook.md.",
  ]);
});

test("the reporter never logs outside production", () => {
  const messages: string[] = [];
  const report = createMissingCronSecretReporter({
    isProduction: () => false,
    log: (message) => messages.push(message),
  });
  report();
  report();
  report();
  expect(messages).toEqual([]);
});
