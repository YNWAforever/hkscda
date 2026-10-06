import { checkReleaseSchema } from "../../../../src/lib/operations/releaseSchema";
import { releaseManifest } from "../../../../src/lib/operations/releaseManifest";
import type { Catalog } from "../../../../supabase/rls-tests/helpers/productionSchemaClone";

/** Actual unchanged release-manifest projection; metadata only, no readiness RPC. */
export async function gaps(c: Catalog) {
  const es = (k: string) => (c[k] ?? []) as Record<string, unknown>[];
  return (
    await checkReleaseSchema(
      {
        async load() {
          return {
            tables: es("relations")
              .filter((e) => ["r", "p"].includes(String(e.kind)))
              .map((e) => ({
                schema: String(e.schema),
                name: String(e.name),
                rls: Boolean(e.rls),
                columns: Object.fromEntries(
                  es("columns")
                    .filter((x) => x.schema === e.schema && x.table === e.name)
                    .map((x) => [String(x.name), String(x.type)]),
                ),
                grants: Object.fromEntries(
                  ["anon", "authenticated", "service_role"].map((role) => [
                    role,
                    ((e.acl ?? []) as { grantee: string; privilege: string }[])
                      .filter((a) => a.grantee === role)
                      .map((a) => a.privilege),
                  ]),
                ),
              })),
            functions: es("functions").map((e) => ({
              schema: String(e.schema),
              name: String(e.name),
              arguments: String(e.args),
              returns: String(e.result),
              executeRoles: ((e.acl ?? []) as { grantee: string; privilege: string }[])
                .filter((a) => a.privilege === "EXECUTE")
                .map((a) => a.grantee),
            })),
            migrationVersions: [],
          };
        },
      },
      releaseManifest,
    )
  ).issues;
}
