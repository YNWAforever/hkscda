import { expect, mock, test } from "bun:test";
import {
  createContentMediaLifecycle,
  type MediaSession,
  type ContentMediaPorts,
} from "./mediaLifecycle.server";
const contentId = "73cc7721-cb1e-4f01-8f21-7a1f1c37e2ae";
const actorUserId = "7d3ec361-f0a0-4300-8808-c34ed4e86542";
const sessionId = "c3644738-7ea4-4a38-8e6e-46b5b6a44a4b";
const result = { contentId, version: 8, revisionId: sessionId, childId: sessionId };
function fixture() {
  const session: MediaSession = {
    id: sessionId,
    contentId,
    expectedVersion: 7,
    storageBucket: "content-media-private",
    storagePath: `${contentId}/${sessionId}.png`,
    mimeType: "image/png",
    byteSize: 8,
    storyUpdateId: null,
    expiresAt: "2026-09-06T00:00:00Z",
    result: null,
  };
  const ports = {
    createSession: mock(async () => session),
    getSession: mock(async () => session),
    signUpload: mock(async () => ({ token: "test-token", path: session.storagePath })),
    download: mock(async () => new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])),
    finalize: mock(async () => result),
    preview: mock(async () => "https://example.test/signed"),
    preparePublication: mock(async () => [
      {
        id: sessionId,
        sourceBucket: "content-media-private",
        sourcePath: session.storagePath,
        publicBucket: "content-media",
        publicPath: `published/${sessionId}/${sessionId}.png`,
        sha256: "digest",
        ready: false,
      },
    ]),
    copyPublic: mock(async () => undefined),
    markPublicReady: mock(async () => undefined),
    publish: mock(async () => result),
  } satisfies ContentMediaPorts;
  return {
    ports,
    service: createContentMediaLifecycle(ports, () => new Date("2026-09-05T00:00:00Z")),
  };
}
test("allocates a private server-owned upload target", async () => {
  const { ports, service } = fixture();
  const target = await service.allocate({
    actorUserId,
    contentId,
    input: {
      expectedVersion: 7,
      mimeType: "image/png",
      byteSize: 8,
      storyUpdateId: null,
      objectPath: "attacker/public.png",
    },
  });
  expect(target.bucket).toBe("content-media-private");
  expect(target.uploadSessionId).toBe(sessionId);
  expect(ports.signUpload).toHaveBeenCalledWith(
    "content-media-private",
    `${contentId}/${sessionId}.png`,
  );
});
test("rejects invalid image bytes before finalization", async () => {
  const { ports, service } = fixture();
  ports.download.mockResolvedValue(new Uint8Array(8));
  await expect(
    service.finalize({
      actorUserId,
      contentId,
      input: { uploadSessionId: sessionId, expectedVersion: 7, altText: "Image" },
    }),
  ).rejects.toThrow();
  expect(ports.finalize).not.toHaveBeenCalled();
});
test("a failed public copy leaves the previous publication untouched", async () => {
  const { ports, service } = fixture();
  ports.copyPublic.mockRejectedValue(new Error("Synthetic copy failure"));
  await expect(
    service.publish({
      actorUserId,
      contentId,
      input: {
        expectedVersion: 7,
        revisionId: sessionId,
        idempotencyKey: "publication-request-0001",
      },
    }),
  ).rejects.toThrow();
  expect(ports.publish).not.toHaveBeenCalled();
  expect(ports.markPublicReady).not.toHaveBeenCalled();
});
test("publishes only after approved public copies are ready", async () => {
  const { ports, service } = fixture();
  await service.publish({
    actorUserId,
    contentId,
    input: {
      expectedVersion: 7,
      revisionId: sessionId,
      idempotencyKey: "publication-request-0001",
    },
  });
  expect(ports.copyPublic).toHaveBeenCalledTimes(1);
  expect(ports.markPublicReady).toHaveBeenCalledTimes(1);
  expect(ports.publish).toHaveBeenCalledTimes(1);
});

test("rejects an expired upload session before downloading", async () => {
  const { ports, service } = fixture();
  const session = await ports.getSession();
  ports.getSession.mockResolvedValue({ ...session, expiresAt: "2026-09-04T00:00:00Z" });
  await expect(
    service.finalize({
      actorUserId,
      contentId,
      input: { uploadSessionId: sessionId, expectedVersion: 7, altText: "Image" },
    }),
  ).rejects.toThrow("expired");
  expect(ports.download).not.toHaveBeenCalled();
});
test("rejects a foreign-content session before reading bytes", async () => {
  const { ports, service } = fixture();
  const session = await ports.getSession();
  ports.getSession.mockResolvedValue({ ...session, contentId: actorUserId });
  await expect(
    service.finalize({
      actorUserId,
      contentId,
      input: { uploadSessionId: sessionId, expectedVersion: 7, altText: "Image" },
    }),
  ).rejects.toThrow("ownership");
  expect(ports.download).not.toHaveBeenCalled();
});
test("finalization replay asks the database to compare the original payload without redownloading", async () => {
  const { ports, service } = fixture();
  const session = await ports.getSession();
  ports.getSession.mockResolvedValue({ ...session, result });
  await expect(
    service.finalize({
      actorUserId,
      contentId,
      input: { uploadSessionId: sessionId, expectedVersion: 7, altText: "Image" },
    }),
  ).resolves.toEqual(result);
  expect(ports.download).not.toHaveBeenCalled();
  expect(ports.finalize).toHaveBeenCalledWith(
    expect.objectContaining({ uploadSessionId: sessionId, sha256: null }),
  );
});
test("readiness persistence failure prevents publication after copying", async () => {
  const { ports, service } = fixture();
  ports.markPublicReady.mockRejectedValue(new Error("Synthetic DB failure"));
  await expect(
    service.publish({
      actorUserId,
      contentId,
      input: {
        expectedVersion: 7,
        revisionId: sessionId,
        idempotencyKey: "publication-request-0001",
      },
    }),
  ).rejects.toThrow();
  expect(ports.publish).not.toHaveBeenCalled();
});

test("invalid preparation never copies private media or advances publication", async () => {
  const { ports, service } = fixture();
  ports.preparePublication.mockRejectedValue(new Error("Public map label is required"));
  await expect(
    service.publish({
      actorUserId,
      contentId,
      input: {
        expectedVersion: 7,
        revisionId: sessionId,
        idempotencyKey: "publication-request-0001",
      },
    }),
  ).rejects.toThrow("Public map");
  expect(ports.copyPublic).not.toHaveBeenCalled();
  expect(ports.publish).not.toHaveBeenCalled();
});
