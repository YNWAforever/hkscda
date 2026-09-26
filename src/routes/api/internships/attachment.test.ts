import { expect, test } from "bun:test";
import { createInternshipAttachmentPostHandler } from "./attachment";

const request = () =>
  new Request("https://unit-test.invalid/api/internships/attachment", {
    method: "POST",
    headers: { "x-vercel-forwarded-for": "203.0.113.5" },
  });

test("rate-limited uploads never reach the attachment handler", async () => {
  let handled = 0;
  const post = createInternshipAttachmentPostHandler({
    rateLimit: async () => ({ ok: false }),
    handleAttachment: async () => {
      handled += 1;
      return new Response(null, { status: 200 });
    },
  });
  const response = await post(request());
  expect(response.status).toBe(429);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(handled).toBe(0);
});

test("allowed uploads use the trusted IP and reach the attachment handler", async () => {
  const calls: string[] = [];
  const post = createInternshipAttachmentPostHandler({
    rateLimit: async (identifier, options) => {
      calls.push(identifier, options.prefix, String(options.max), options.window);
      return { ok: true };
    },
    handleAttachment: async () => {
      calls.push("attachment");
      return new Response(null, { status: 204 });
    },
  });
  expect((await post(request())).status).toBe(204);
  expect(calls).toEqual(["203.0.113.5", "internship-attachment", "10", "1 m", "attachment"]);
});
