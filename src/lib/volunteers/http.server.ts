import { volunteerPolicyFailure } from "./policy/errors";
import { volunteerCodeMessage } from "./apiResult";
import { z } from "zod";

import type { AdminUser } from "../donations/supabase.server";
import { RequestBodyTooLargeError, readPublicJson } from "../http/publicJson.server";
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
    return await readPublicJson(request);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError)
      throw jsonResponse({ error: "Request body too large" }, { status: 413 });
    throw jsonResponse({ error: "Invalid JSON body" }, { status: 400 });
  }
}

function jsonResponse(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

/**
 * Refusals raised by the `volunteer_enforce_registration_policy` trigger as bare codes.
 * They are business answers ("an earlier waitlisted volunteer comes first"), not faults,
 * but were not in the policy-code map and so surfaced as 500 "try again" (BUG-10).
 */
const REGISTRATION_TRIGGER_REFUSALS: Record<string, { pgCode: string; status: number }> = {
  waitlist_priority: { pgCode: "22023", status: 409 },
  waitlist_disabled: { pgCode: "22023", status: 409 },
  waitlist_full: { pgCode: "22023", status: 409 },
  immutable_booking_identity: { pgCode: "42501", status: 403 },
};

function registrationTriggerRefusal(error: unknown) {
  if (!error || typeof error !== "object") return null;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (typeof code !== "string" || typeof message !== "string") return null;
  const refusal = REGISTRATION_TRIGGER_REFUSALS[message];
  if (!refusal || refusal.pgCode !== code) return null;
  return {
    code: message,
    status: refusal.status,
    // Every code above has an entry in the apiResult message table.
    message: volunteerCodeMessage(message) ?? message,
  };
}

async function withVolunteerErrors(operation: () => Promise<Response>, publicRequest = false) {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Response) return error;
    if (error instanceof z.ZodError) {
      if (publicRequest && error.issues.some((issue) => issue.path[0] === "submissionToken")) {
        return jsonResponse(
          {
            code: "submission_token_required",
            error:
              "submissionToken must be 32 random bytes encoded as canonical base64url. Generate it once per registration and reuse it on retries.",
          },
          { status: 400 },
        );
      }
      return jsonResponse(
        {
          error: publicRequest
            ? "Invalid volunteer registration request"
            : "Invalid volunteer management request",
        },
        { status: 400 },
      );
    }
    const triggerRefusal = registrationTriggerRefusal(error);
    if (triggerRefusal)
      return jsonResponse(
        {
          error: publicRequest ? "未能完成報名：" + triggerRefusal.message : triggerRefusal.message,
          code: triggerRefusal.code,
        },
        { status: triggerRefusal.status },
      );
    // A table check constraint (for example an update moving endsAt before the stored
    // startsAt) is invalid input, not a server fault (BUG-17).
    if (error && typeof error === "object" && "code" in error && error.code === "23514")
      return jsonResponse(
        {
          error: publicRequest
            ? "Invalid volunteer registration request"
            : "Invalid volunteer management request",
        },
        { status: 400 },
      );
    const failure = volunteerPolicyFailure(error);
    if (failure)
      return jsonResponse(
        {
          error: publicRequest ? "未能完成報名：" + failure.message : failure.message,
          code: failure.code,
        },
        { status: 409 },
      );
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
        if (!body || typeof body !== "object" || Array.isArray(body)) {
          return jsonResponse({ error: "Invalid volunteer registration request" }, { status: 400 });
        }
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

    cloneActivity({ request }: HandlerContext) {
      return withVolunteerErrors(async () => {
        await requireVolunteerAdmin(request);
        return jsonResponse(
          {
            error: "請在活動工作台使用「複製至指定日期」，先選日期並預覽適用政策。",
            code: "target_date_preview_required",
          },
          { status: 410 },
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
