import { ContentLifecycleError } from "./lifecycle";
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { ContentValidationError, createContentService } from "./service";

type ContentService = ReturnType<typeof createContentService>;

type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type CreateContentHandlersArgs = {
  requireContentAdmin: (request: Request) => Promise<AdminUser>;
  service: ContentService;
};

function searchParams(request: Request) {
  return Object.fromEntries(new URL(request.url).searchParams);
}

async function jsonBody(request: Request) {
  try {
    return await request.json();
  } catch {
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

async function optionalJsonBody(request: Request) {
  const body = await request.text();
  if (!body.trim()) return {};

  try {
    return JSON.parse(body);
  } catch {
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

function publicJsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "public, s-maxage=60, stale-while-revalidate=300");
  return Response.json(body, { ...init, headers });
}
function requiredId(params: HandlerContext["params"], key = "id") {
  const id = params?.[key];
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw jsonResponse({ error: "Invalid content id" }, { status: 400 });
  }
  return id;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    return typeof message === "string" ? message : null;
  }
  return null;
}

function isSingleRowMissingError(error: unknown) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    (error as { code?: unknown }).code === "PGRST116"
  );
}

async function withContentErrors(operation: () => Promise<Response>, publicRequest = false) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof ContentLifecycleError)
      return jsonResponse(
        { error: { message: error.message, code: error.code } },
        { status: error.status },
      );
    if (error instanceof z.ZodError) {
      return jsonResponse(
        {
          error: publicRequest
            ? "Could not load story content"
            : "Invalid content management request",
        },
        { status: 400 },
      );
    }
    if (error instanceof ContentValidationError) {
      return jsonResponse(
        { error: "Content item cannot be published", issues: error.issues },
        { status: 400 },
      );
    }

    if (!publicRequest) {
      const message = getErrorMessage(error);
      if (message === "Content item not found" || message === "Story update not found") {
        return jsonResponse({ error: message }, { status: 404 });
      }
      if (message === "Story update does not belong to this content item") {
        return jsonResponse({ error: message }, { status: 400 });
      }
      if (message === "Upload path does not belong to this content item") {
        return jsonResponse({ error: message }, { status: 400 });
      }
      if (message === "Content items must be created as drafts") {
        return jsonResponse({ error: message }, { status: 400 });
      }
      if (message === "Internal story updates cannot use public content media") {
        return jsonResponse({ error: message }, { status: 400 });
      }
      if (message === "Internal story updates cannot generate outbound content") {
        return jsonResponse({ error: message }, { status: 400 });
      }
      if (isSingleRowMissingError(error)) {
        return jsonResponse({ error: "Content resource not found" }, { status: 404 });
      }
    }

    console.error(error);
    return jsonResponse(
      {
        error: publicRequest
          ? "Could not load story content"
          : "Could not process content management request",
      },
      { status: 500 },
    );
  }
}

export function createContentHandlers({ requireContentAdmin, service }: CreateContentHandlersArgs) {
  return {
    listPublicContent({ request }: HandlerContext) {
      return withContentErrors(async () => {
        return jsonResponse(await service.listPublicContent(searchParams(request)));
      }, true);
    },

    listPublicStoriesPage({ request }: HandlerContext) {
      return withContentErrors(async () => {
        return publicJsonResponse(await service.listPublicStoriesPage(searchParams(request)));
      }, true);
    },
    getPublicContent({ params }: HandlerContext) {
      return withContentErrors(async () => {
        const slug = params?.slug;
        if (!slug) return jsonResponse({ error: "Invalid story slug" }, { status: 400 });

        const content = await service.getPublicContentBySlug(slug);
        if (!content) return jsonResponse({ error: "Story content not found" }, { status: 404 });

        return jsonResponse({ content });
      }, true);
    },

    listPublicMapStories({ request }: HandlerContext) {
      return withContentErrors(async () => {
        return jsonResponse({ points: await service.listPublicMapStories(searchParams(request)) });
      }, true);
    },

    listRevisions({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        await requireContentAdmin(request);
        const query = new URL(request.url).searchParams;
        if (query.has("revisionId"))
          return jsonResponse({
            revision: await service.getRevision(
              requiredId(params),
              z.string().uuid().parse(query.get("revisionId")),
            ),
          });
        const beforeVersion = query.has("beforeVersion")
          ? z.coerce.number().int().nonnegative().parse(query.get("beforeVersion"))
          : undefined;
        const revisions = await service.listRevisions(requiredId(params), beforeVersion);
        return jsonResponse({
          revisions,
          nextBeforeVersion: revisions.length === 20 ? revisions.at(-1)?.version : null,
        });
      });
    },
    restoreRevision({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        const input = z
          .object({ expectedVersion: z.number().int().nonnegative() })
          .parse(await jsonBody(request));
        return jsonResponse(
          await service.restoreRevision({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: { ...input, revisionId: requiredId(params, "revisionId") },
          }),
        );
      });
    },
    listAdminContent({ request }: HandlerContext) {
      return withContentErrors(async () => {
        await requireContentAdmin(request);
        return jsonResponse(await service.listAdminContent(searchParams(request)));
      });
    },

    createContent({ request }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.createContent({
            actorUserId: admin.authUserId,
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    getContent({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        await requireContentAdmin(request);
        const query = new URL(request.url).searchParams;
        if (query.has("updateId"))
          return jsonResponse({
            body: await service.getAdminUpdateBody(
              requiredId(params),
              z.string().uuid().parse(query.get("updateId")),
            ),
          });
        const historyPage = z.coerce
          .number()
          .int()
          .min(1)
          .max(100000)
          .parse(query.get("historyPage") ?? 1);
        const content = await service.getAdminContent(requiredId(params), historyPage);
        if (!content) return jsonResponse({ error: "Content item not found" }, { status: 404 });

        return jsonResponse({ content });
      });
    },

    updateContent({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse({
          content: await service.updateContent({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
        });
      });
    },

    upsertStoryProfile({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse({
          content: await service.upsertStoryProfile({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
        });
      });
    },

    createStoryUpdate({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.createStoryUpdate({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    createContentMedia({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.createContentMedia({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    previewMedia({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.previewMedia({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
        );
      });
    },
    createUploadTarget({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.createUploadTarget({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    createContentLink({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.createContentLink({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    publishContent({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse({
          content: await service.publishContent({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await optionalJsonBody(request),
          }),
        });
      });
    },

    archiveContent({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse({
          content: await service.archiveContent({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await optionalJsonBody(request),
          }),
        });
      });
    },

    generateSocialCopy({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.generateSocialCopy({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
            input: await optionalJsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    generateNotificationDrafts({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.generateNotificationDrafts({
            actorUserId: admin.authUserId,
            storyUpdateId: requiredId(params, "updateId"),
          }),
          { status: 201 },
        );
      });
    },

    updateNotificationDraftStatus({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.updateNotificationDraftStatus({
            actorUserId: admin.authUserId,
            draftId: requiredId(params),
            input: await jsonBody(request),
          }),
        );
      });
    },

    updateSocialCopyStatus({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse(
          await service.updateSocialCopyStatus({
            actorUserId: admin.authUserId,
            copyId: requiredId(params),
            input: await jsonBody(request),
          }),
        );
      });
    },
  };
}
