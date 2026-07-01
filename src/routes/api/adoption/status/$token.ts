import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import {
  buildPublicStatusSummary,
  hashStatusToken,
  isTokenExpired,
} from "../../../../lib/publicAdoption/statusToken.server";

type HandlerContext = {
  params: {
    token?: string;
  };
};

type StatusTokenRow = {
  id: string;
  entity_id: string;
  expires_at: string;
  revoked_at: string | null;
};

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("cache-control", "no-store");
  return Response.json(body, { ...init, headers });
}

async function loadPublicAdoptionStatus({ params }: HandlerContext) {
  try {
    if (!params.token) {
      return jsonNoStore({ error: "Status link not found" }, { status: 404 });
    }

    const client = createSupabaseServiceClient();
    const { data: tokenRow, error: tokenError } = await client
      .from("public_status_token")
      .select("id,entity_id,expires_at,revoked_at")
      .eq("token_hash", hashStatusToken(params.token))
      .eq("entity_type", "adoption_application")
      .maybeSingle<StatusTokenRow>();

    if (tokenError) throw tokenError;
    if (!tokenRow) {
      return jsonNoStore({ error: "Status link not found" }, { status: 404 });
    }
    if (tokenRow.revoked_at || isTokenExpired(tokenRow.expires_at)) {
      return jsonNoStore({ error: "Status link expired" }, { status: 410 });
    }

    const viewedAt = new Date().toISOString();
    const { error: updateError } = await client
      .from("public_status_token")
      .update({ last_viewed_at: viewedAt })
      .eq("id", tokenRow.id);
    if (updateError) {
      console.error("Failed to update adoption status token last_viewed_at", updateError);
    }

    const [applicationResult, preferencesResult, visitResult] = await Promise.all([
      client
        .from("adoption_applications")
        .select("id,created_at,applicant_name,email,phone")
        .eq("id", tokenRow.entity_id)
        .maybeSingle(),
      client
        .from("adoption_application_animal_preference")
        .select("rank,animal_name_snapshot,animal_type_snapshot")
        .eq("public_application_id", tokenRow.entity_id)
        .order("rank", { ascending: true }),
      client
        .from("adoption_application_visit_preference")
        .select("date_range_start,date_range_end,preferred_time_windows,notes")
        .eq("public_application_id", tokenRow.entity_id)
        .maybeSingle(),
    ]);

    if (applicationResult.error) throw applicationResult.error;
    if (preferencesResult.error) throw preferencesResult.error;
    if (visitResult.error) throw visitResult.error;
    if (!applicationResult.data) {
      return jsonNoStore({ error: "Status link not found" }, { status: 404 });
    }

    return jsonNoStore({
      status: buildPublicStatusSummary({
        application: applicationResult.data,
        preferences: preferencesResult.data ?? [],
        visit: visitResult.data ?? null,
        token: { expires_at: tokenRow.expires_at },
      }),
    });
  } catch (error) {
    console.error(error);
    return jsonNoStore({ error: "Could not load adoption status" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/adoption/status/$token")({
  server: {
    handlers: {
      GET: ({ params }) => loadPublicAdoptionStatus({ params }),
    },
  },
});
