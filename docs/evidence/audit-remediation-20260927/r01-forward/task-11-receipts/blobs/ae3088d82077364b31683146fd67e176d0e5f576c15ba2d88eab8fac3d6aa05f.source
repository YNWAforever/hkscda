import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";

/** Task11 fixtures: existing owned clone, or the exact opted GitHub CI stack. */
export function assertFinanceFixtureUrl(
  url: string,
  environment: Record<string, string | undefined>,
): string {
  if (environment.R01_FINANCE_CALLBACK_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Task11 explicit fixture opt-in required");
  if (
    environment.CI === "true" &&
    environment.GITHUB_ACTIONS === "true" &&
    url === "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
  )
    return url;
  return assertCloneUrl(url);
}
