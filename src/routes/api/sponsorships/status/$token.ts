import { createFileRoute } from "@tanstack/react-router";

import { createSupabaseServiceClient } from "../../../../lib/donations/supabase.server";
import { hashStatusToken, isTokenExpired } from "../../../../lib/publicAdoption/statusToken.server";
import { buildPublicPledgeStatusSummary } from "../../../../lib/sponsorship/statusSummary";

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

async function loadPublicSponsorshipStatus({ params }: HandlerContext) {
  try {
    if (!params.token) {
      return jsonNoStore({ error: "Status link not found" }, { status: 404 });
    }

    const client = createSupabaseServiceClient();
    const { data: tokenRow, error: tokenError } = await client
      .from("public_status_token")
      .select("id,entity_id,expires_at,revoked_at")
      .eq("token_hash", hashStatusToken(params.token))
      .eq("entity_type", "sponsorship_pledge")
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
      console.error("Failed to update sponsorship status token last_viewed_at", updateError);
    }

    const [pledgeResult, preferencesResult, proofResult] = await Promise.all([
      client
        .from("sponsorship_pledge")
        .select("id,created_at,monthly_tier,amount_cents,status")
        .eq("id", tokenRow.entity_id)
        .maybeSingle(),
      client
        .from("sponsorship_preference")
        .select("rank,animal_name_snapshot")
        .eq("pledge_id", tokenRow.entity_id)
        .order("rank", { ascending: true }),
      client
        .from("sponsorship_payment_proof")
        .select("id")
        .eq("pledge_id", tokenRow.entity_id)
        .maybeSingle(),
    ]);

    if (pledgeResult.error) throw pledgeResult.error;
    if (preferencesResult.error) throw preferencesResult.error;
    if (proofResult.error) throw proofResult.error;
    if (!pledgeResult.data) {
      return jsonNoStore({ error: "Status link not found" }, { status: 404 });
    }

    return jsonNoStore({
      status: buildPublicPledgeStatusSummary({
        pledge: pledgeResult.data,
        preferences: preferencesResult.data ?? [],
        hasPaymentProof: Boolean(proofResult.data),
        token: { expires_at: tokenRow.expires_at },
      }),
    });
  } catch (error) {
    console.error(error);
    return jsonNoStore({ error: "Could not load sponsorship status" }, { status: 500 });
  }
}

export const Route = createFileRoute("/api/sponsorships/status/$token")({
  server: {
    handlers: {
      GET: ({ params }) => loadPublicSponsorshipStatus({ params }),
    },
  },
});
