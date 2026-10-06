import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";

/** Task12 uses only an owned clone or the explicitly opted real GitHub stack. */
export function assertGroupFixtureUrl(
  url: string,
  environment: Record<string, string | undefined>,
): string {
  if (environment.R01_GROUP_ENQUIRY_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Task12 explicit fixture opt-in required");
  if (
    environment.CI === "true" &&
    environment.GITHUB_ACTIONS === "true" &&
    url === "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
  )
    return url;
  return assertCloneUrl(url);
}
