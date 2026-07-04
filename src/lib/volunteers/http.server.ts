import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { createVolunteerService } from "./service";

type VolunteerService = ReturnType<typeof createVolunteerService>;

type HandlerContext = {
  request: Request;
  params?: Record<string, string | undefined>;
};

type CreateVolunteerHandlersArgs = {
  requireVolunteerAdmin: (request: Request) => Promise<AdminUser>;
  service: VolunteerService;
  verifyPublicRegistration?: (input: Record<string, unknown>, request: Request) => Promise<boolean>;
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

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function withVolunteerErrors(operation: () => Promise<Response>, publicRequest = false) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      return jsonResponse(
        {
          error: publicRequest
            ? "Invalid volunteer registration request"
            : "Invalid volunteer management request",
        },
        { status: 400 },
      );
    }
    console.error(error);
    return jsonResponse(
      {
        error: publicRequest
          ? "Volunteer registration could not be processed"
          : "Could not process volunteer management request",
      },
      { status: 500 },
    );
  }
}

function requiredId(params: HandlerContext["params"], key = "id") {
  const id = params?.[key];
  if (!id || !z.string().uuid().safeParse(id).success) {
    throw jsonResponse({ error: "Invalid volunteer id" }, { status: 400 });
  }
  return id;
}

export function createVolunteerHandlers({
  requireVolunteerAdmin,
  service,
  verifyPublicRegistration = async () => true,
}: CreateVolunteerHandlersArgs) {
  return {
    listPublishedActivities({ request }: HandlerContext) {
      return withVolunteerErrors(async () => {
        return jsonResponse({ activities: await service.listPublishedActivities() });
      }, true);
    },

    submitPublicRegistration({ request }: HandlerContext) {
      return withVolunteerErrors(async () => {
        const body = await jsonBody(request);
        if (!(await verifyPublicRegistration(body as Record<string, unknown>, request))) {
          return jsonResponse({ error: "Verification failed" }, { status: 403 });
        }
        return jsonResponse(await service.submitPublicRegistration(body), {
          status: 201,
        });
      }, true);
    },

    getPublicRegistrationStatus({ params }: HandlerContext) {
      return withVolunteerErrors(async () => {
        const token = params?.token;
        if (!token)
          return jsonResponse({ error: "Invalid volunteer status token" }, { status: 400 });
        const status = await service.getPublicRegistrationStatus(token);
        if (!status)
          return jsonResponse({ error: "Volunteer registration not found" }, { status: 404 });
        return jsonResponse({ registration: status });
      }, true);
    },

    listActivities({ request }: HandlerContext) {
      return withVolunteerErrors(async () => {
        await requireVolunteerAdmin(request);
        return jsonResponse(await service.listActivities(searchParams(request)));
      });
    },

    createActivity({ request }: HandlerContext) {
      return withVolunteerErrors(async () => {
        const admin = await requireVolunteerAdmin(request);
        return jsonResponse(
          await service.createActivity({
            actorUserId: admin.authUserId,
            input: await jsonBody(request),
          }),
          { status: 201 },
        );
      });
    },

    getActivity({ request, params }: HandlerContext) {
      return withVolunteerErrors(async () => {
        await requireVolunteerAdmin(request);
        const activity = await service.getActivityDetail(requiredId(params));
        if (!activity)
          return jsonResponse({ error: "Volunteer activity not found" }, { status: 404 });
        return jsonResponse({ activity });
      });
    },

    updateActivity({ request, params }: HandlerContext) {
      return withVolunteerErrors(async () => {
        const admin = await requireVolunteerAdmin(request);
        return jsonResponse(
          await service.updateActivity({
            actorUserId: admin.authUserId,
            activityId: requiredId(params),
            input: await jsonBody(request),
          }),
        );
      });
    },

    cloneActivity({ request, params }: HandlerContext) {
      return withVolunteerErrors(async () => {
        const admin = await requireVolunteerAdmin(request);
        return jsonResponse(
          await service.cloneActivity({
            actorUserId: admin.authUserId,
            activityId: requiredId(params),
            input: await jsonBody(request).catch(() => ({})),
          }),
          { status: 201 },
        );
      });
    },

    listRegistrations({ request }: HandlerContext) {
      return withVolunteerErrors(async () => {
        await requireVolunteerAdmin(request);
        return jsonResponse(await service.listRegistrations(searchParams(request)));
      });
    },

    getRegistration({ request, params }: HandlerContext) {
      return withVolunteerErrors(async () => {
        await requireVolunteerAdmin(request);
        const registration = await service.getRegistrationDetail(requiredId(params));
        if (!registration) {
          return jsonResponse({ error: "Volunteer registration not found" }, { status: 404 });
        }
        return jsonResponse({ registration });
      });
    },

    updateRegistrationStatus({ request, params }: HandlerContext) {
      return withVolunteerErrors(async () => {
        const admin = await requireVolunteerAdmin(request);
        return jsonResponse({
          registration: await service.updateRegistrationStatus({
            actorUserId: admin.authUserId,
            registrationId: requiredId(params),
            input: await jsonBody(request),
          }),
        });
      });
    },

    updateAttendance({ request, params }: HandlerContext) {
      return withVolunteerErrors(async () => {
        const admin = await requireVolunteerAdmin(request);
        return jsonResponse({
          registration: await service.updateAttendance({
            actorUserId: admin.authUserId,
            registrationId: requiredId(params),
            input: await jsonBody(request),
          }),
        });
      });
    },
  };
}
