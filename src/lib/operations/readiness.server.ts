import { randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ADOPTION_INSTRUCTIONS_PAGE_KEY } from "../adoptionInstructions/content";
import { adoptionInstructionContentSchema } from "../adoptionInstructions/schemas";
import {
  loadPublicAdoptionPage,
  type PublicAdoptionPageData,
} from "../adoptionInformation/publicPage.server";
import { createSupabaseServiceClient } from "../donations/supabase.server";
import { isProductionRuntime } from "../security/turnstile.server";
import { authorizedCron } from "../volunteers/jobs/auth.server";

export type ReadinessState = "ready" | "degraded" | "unavailable";
type Feature = "cms" | "adoption" | "antiAbuse";
type FeatureState = { state: ReadinessState; code?: string; causeCode?: string };

export type ReadinessReport = {
  state: ReadinessState;
  releaseSha: string;
  correlationId: string;
  features: Record<Feature, FeatureState>;
};

export type ReadinessDeps = {
  readCmsRevision: () => Promise<unknown>;
  readPublicAdoption: () => Promise<PublicAdoptionPageData>;
  config: {
    isProduction: boolean;
    turnstileSiteKey?: string | null;
    turnstileSecret?: string | null;
    upstashUrl?: string | null;
    upstashToken?: string | null;
  };
  releaseSha: string;
  correlationId: string;
};

const ready: FeatureState = { state: "ready" };

function errorCode(error: unknown): string {
  let current = error;
  for (let depth = 0; depth < 3; depth++) {
    if (typeof current !== "object" || current === null) break;
    const code = (current as { code?: unknown }).code;
    if (typeof code === "string" && /^[A-Z0-9_]{2,16}$/.test(code)) return code;
    current = (current as { cause?: unknown }).cause;
  }
  return "UNKNOWN";
}

async function cmsState(read: ReadinessDeps["readCmsRevision"]): Promise<FeatureState> {
  try {
    const revision = await read();
    if (!revision || typeof revision !== "object" || !("state" in revision)) {
      return { state: "unavailable", code: "CMS_UNPUBLISHED" };
    }
    if (revision.state !== "published") {
      return { state: "unavailable", code: "CMS_UNPUBLISHED" };
    }
    if (
      !("content" in revision) ||
      !adoptionInstructionContentSchema.safeParse(revision.content).success
    ) {
      return { state: "unavailable", code: "CMS_INVALID_CONTENT" };
    }
    return ready;
  } catch (error) {
    const causeCode = errorCode(error);
    if (causeCode === "PGRST205" || causeCode === "42P01") {
      return { state: "degraded", code: "CMS_SCHEMA_MISSING", causeCode };
    }
    return { state: "unavailable", code: "CMS_READ_FAILED", causeCode };
  }
}

async function adoptionState(read: ReadinessDeps["readPublicAdoption"]): Promise<FeatureState> {
  try {
    const data = await read();
    if (!adoptionInstructionContentSchema.safeParse(data?.copy).success) {
      return { state: "unavailable", code: "ADOPTION_INVALID_CONTENT" };
    }
    return ready;
  } catch (error) {
    return { state: "unavailable", code: "ADOPTION_READ_FAILED", causeCode: errorCode(error) };
  }
}

function antiAbuseState(config: ReadinessDeps["config"]): FeatureState {
  if (!config.isProduction) return ready;
  if (
    !config.turnstileSiteKey ||
    !config.turnstileSecret ||
    !config.upstashUrl ||
    !config.upstashToken
  ) {
    return { state: "unavailable", code: "ANTI_ABUSE_UNCONFIGURED" };
  }
  return ready;
}

export async function checkReadiness(deps: ReadinessDeps): Promise<ReadinessReport> {
  const [cms, adoption] = await Promise.all([
    cmsState(deps.readCmsRevision),
    adoptionState(deps.readPublicAdoption),
  ]);
  const features = { cms, adoption, antiAbuse: antiAbuseState(deps.config) };
  const states = Object.values(features).map((feature) => feature.state);
  return {
    state: states.includes("unavailable")
      ? "unavailable"
      : states.includes("degraded")
        ? "degraded"
        : "ready",
    releaseSha: deps.releaseSha,
    correlationId: deps.correlationId,
    features,
  };
}

export function createReadinessDeps(
  env: NodeJS.ProcessEnv = process.env,
  client: SupabaseClient = createSupabaseServiceClient(),
): ReadinessDeps {
  return {
    readCmsRevision: async () => {
      const { data, error } = await client
        .from("adoption_instruction_revisions")
        .select("state,content")
        .eq("page_key", ADOPTION_INSTRUCTIONS_PAGE_KEY)
        .eq("state", "published")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    readPublicAdoption: () => loadPublicAdoptionPage(),
    config: {
      isProduction: isProductionRuntime(env),
      turnstileSiteKey: env.VITE_TURNSTILE_SITE_KEY,
      turnstileSecret: env.TURNSTILE_SECRET_KEY,
      upstashUrl: env.UPSTASH_REDIS_REST_URL,
      upstashToken: env.UPSTASH_REDIS_REST_TOKEN,
    },
    releaseSha: env.VERCEL_GIT_COMMIT_SHA ?? env.GITHUB_SHA ?? "unknown",
    correlationId: randomUUID(),
  };
}

export function createReadinessHandler(deps: {
  secret: () => string | undefined;
  check: () => Promise<ReadinessReport>;
  log?: (event: { state: ReadinessState; codes: string[]; releaseSha: string }) => void;
  now?: () => number;
}) {
  let lastSignature = "";
  let lastLoggedAt = 0;
  return async (request: Request): Promise<Response> => {
    const headers = { "cache-control": "no-store" };
    if (!authorizedCron(request, deps.secret())) {
      return Response.json({ error: "unauthorized" }, { status: 401, headers });
    }
    try {
      const report = await deps.check();
      const codes = Object.values(report.features)
        .map((feature) => feature.code)
        .filter((code): code is string => Boolean(code));
      const signature = report.state + ":" + codes.join(",");
      const now = deps.now?.() ?? Date.now();
      if (signature !== lastSignature || now - lastLoggedAt >= 600_000) {
        (deps.log ?? ((event) => console.error("Release readiness", event)))({
          state: report.state,
          codes,
          releaseSha: report.releaseSha,
        });
        lastSignature = signature;
        lastLoggedAt = now;
      }
      return Response.json(report, {
        status: report.state === "unavailable" ? 503 : 200,
        headers,
      });
    } catch {
      return Response.json(
        { state: "unavailable", code: "READINESS_CHECK_FAILED" },
        { status: 503, headers },
      );
    }
  };
}
