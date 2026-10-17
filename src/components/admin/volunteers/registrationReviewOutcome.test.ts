import { expect, test } from "bun:test";

import { registrationReviewOutcome } from "./registrationReviewOutcome";

test("a successful review write reports that the server saved it", () => {
  expect(
    registrationReviewOutcome({
      error: null,
      refreshed: true,
      requestedStatus: "approved",
      observedStatus: "approved",
    }),
  ).toBe("saved");
});

test("a successful write stays saved when the follow-up read fails", () => {
  expect(
    registrationReviewOutcome({
      error: null,
      refreshed: false,
      requestedStatus: "approved",
      observedStatus: "pending",
    }),
  ).toBe("saved_refresh_failed");
});

test("a known server refusal remains a failure instead of becoming outcome-unknown", () => {
  expect(
    registrationReviewOutcome({
      error: { status: 409 },
      refreshed: true,
      requestedStatus: "approved",
      observedStatus: "pending",
    }),
  ).toBe("failed");
});

test("a response-less write confirmed by a server read is recovered", () => {
  expect(
    registrationReviewOutcome({
      error: { status: null },
      refreshed: true,
      requestedStatus: "approved",
      observedStatus: "approved",
    }),
  ).toBe("recovered");
});

test("a response-less write is not called failed before the server can be read", () => {
  expect(
    registrationReviewOutcome({
      error: { status: null },
      refreshed: true,
      requestedStatus: "approved",
      observedStatus: "pending",
    }),
  ).toBe("unknown");
  expect(
    registrationReviewOutcome({
      error: { status: 503 },
      refreshed: false,
      requestedStatus: "approved",
      observedStatus: undefined,
    }),
  ).toBe("unknown");
});
