import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";

import { AdminLanguageProvider } from "../../../components/admin/adminI18n";
import { VolunteerAssessments } from "../../../components/admin/volunteers/VolunteerAssessments";
import { clearVolunteerIdentityQueries } from "../../volunteers/queryKeys";
import { seedAdminSessionForTests } from "../sessionMemory";

type FixtureWindow = Window & {
  switchAssessmentActor?: () => Promise<void>;
};

/**
 * The fixture server reads the acting admin from the bearer token (`token-a`/`token-b`). The
 * session BFF keeps the token in memory, so seed it from the same switch the old
 * `supabase.auth.getSession` stub read (the `fixture-assessment-actor` localStorage key).
 */
function seedAssessmentActor() {
  const actor = window.localStorage.getItem("fixture-assessment-actor") || "a";
  seedAdminSessionForTests({ accessToken: `token-${actor}`, authUserId: actor });
}

seedAssessmentActor();

const client = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      staleTime: Number.POSITIVE_INFINITY,
    },
  },
});

export function Fixture() {
  const [generation, setGeneration] = useState(0);
  const initialJobs = new URLSearchParams(window.location.search).has("initial")
    ? [
        {
          id: "fixture-initial-job",
          kind: "fixture-initial",
          status: "queued",
          attempts: 0,
          available_at: "2026-10-17T00:00:00.000Z",
          last_error: null,
        },
      ]
    : undefined;

  (window as FixtureWindow).switchAssessmentActor = async () => {
    await clearVolunteerIdentityQueries(client);
    window.localStorage.setItem("fixture-assessment-actor", "b");
    seedAssessmentActor();
    setGeneration((value) => value + 1);
  };

  return (
    <AdminLanguageProvider initialLanguage="zh">
      <QueryClientProvider client={client}>
        <div key={generation}>
          <VolunteerAssessments initial={initialJobs ? { jobs: initialJobs } : undefined} />
        </div>
      </QueryClientProvider>
    </AdminLanguageProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Fixture />
  </StrictMode>,
);
