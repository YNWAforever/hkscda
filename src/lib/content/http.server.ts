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

function requiredId(params: HandlerContext["params"], key = "id") {
  const id = params?.[key];
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw jsonResponse({ error: "Invalid content id" }, { status: 400 });
  }
  return id;
}

async function withContentErrors(operation: () => Promise<Response>, publicRequest = false) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
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
        const content = await service.getAdminContent(requiredId(params));
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

    publishContent({ request, params }: HandlerContext) {
      return withContentErrors(async () => {
        const admin = await requireContentAdmin(request);
        return jsonResponse({
          content: await service.publishContent({
            actorUserId: admin.authUserId,
            contentId: requiredId(params),
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
