import { assertCloneUrl } from "../../../supabase/rls-tests/helpers/productionSchemaClone";

export function assertVolunteerFixtureUrl(
  url: string,
  environment: Record<string, string | undefined>,
): string {
  if (environment.R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES !== "1")
    throw new Error("Task8 explicit fixture opt-in required");
  if (
    environment.CI === "true" &&
    environment.GITHUB_ACTIONS === "true" &&
    url === "postgresql://postgres:postgres@127.0.0.1:55322/postgres"
  )
    return url;
  return assertCloneUrl(url);
}

/** A configured/required database suite fails closed; only unconfigured units skip. */
export function volunteerFixtureUrl(environment: Record<string, string | undefined>) {
  const required = environment.R01_VOLUNTEER_REQUIRE_DATABASE;
  const optIn = environment.R01_VOLUNTEER_ALLOW_LOCAL_FIXTURES;
  const url = environment.R01_VOLUNTEER_TEST_DATABASE_URL;
  if (required === undefined && optIn === undefined && url === undefined) return undefined;
  if (required !== undefined && required !== "1")
    throw new Error("Task8 required database flag must be literal 1");
  if (!url) throw new Error("Task8 fixture database URL required");
  assertVolunteerFixtureUrl(url, environment);
  return url;
}
