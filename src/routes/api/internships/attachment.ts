import { createFileRoute } from "@tanstack/react-router";
import { internshipAttachment } from "../../../lib/internships/attachments.server";
import {
  enforceRateLimit,
  getClientIp,
  retryAfterSeconds,
} from "../../../lib/security/rate-limit.server";

type Dependencies = {
  rateLimit: typeof enforceRateLimit;
  handleAttachment: (request: Request) => Promise<Response>;
};

export function createInternshipAttachmentPostHandler({
  rateLimit = enforceRateLimit,
  handleAttachment = internshipAttachment,
}: Partial<Dependencies> = {}) {
  return async (request: Request): Promise<Response> => {
    const limit = await rateLimit(getClientIp(request), {
      prefix: "internship-attachment",
      max: 10,
      window: "1 m",
    });
    if (!limit.ok)
      return Response.json(
        { error: "請稍後再試" },
        {
          status: 429,
          headers: {
            "cache-control": "no-store",
            "retry-after": String(retryAfterSeconds(limit)),
          },
        },
      );
    return handleAttachment(request);
  };
}

const postAttachment = createInternshipAttachmentPostHandler();
export const Route = createFileRoute("/api/internships/attachment")({
  server: {
    handlers: {
      GET: ({ request }) => internshipAttachment(request),
      POST: ({ request }) => postAttachment(request),
    },
  },
});
