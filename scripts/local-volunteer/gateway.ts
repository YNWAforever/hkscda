/** Local acceptance infrastructure only. Never forwards to an external host. */
import { SQL } from "bun";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

// Docker proxy defaults may overwrite env-file NO_PROXY. Keep both standard
// spellings, retaining inherited entries and adding only our owned local aliases.
const localBypass = [
  process.env.NO_PROXY,
  process.env.no_proxy,
  "127.0.0.1,localhost,db,auth,rest,storage",
]
  .filter(Boolean)
  .join(",");
process.env.NO_PROXY = localBypass;
process.env.no_proxy = localBypass;

const root = process.env.LOCAL_ACCEPTANCE_ROOT;
if (!root) throw new Error("Explicit local acceptance root required");
const target = JSON.parse(await readFile(join(root, "target-construction.json"), "utf8")) as {
  projectRef: string;
  fixtureId: string;
  systemIdentifier: string;
  syntheticOnly: boolean;
  productionConnection: boolean;
};
if (
  !target.syntheticOnly ||
  target.productionConnection ||
  !target.projectRef.startsWith("hkscda-volunteer-local-")
)
  throw new Error("Not a constructed synthetic target");
const raw = process.env.LOCAL_TEST_CONTROL_URL;
if (!raw) throw new Error("Local control URL required");
const url = new URL(raw);
if (url.hostname !== "db" || url.port !== "5432" || url.pathname !== "/postgres")
  throw new Error("Only the private Docker DB alias is accepted");
const db = new SQL(raw, { max: 2, prepare: false });
async function identity() {
  const rows =
    await db`select (select system_identifier::text from pg_control_system()) system_identifier,
    fixture_id::text, project_ref from local_acceptance.identity`;
  if (
    rows.length !== 1 ||
    rows[0].system_identifier !== target.systemIdentifier ||
    rows[0].fixture_id !== target.fixtureId ||
    rows[0].project_ref !== target.projectRef
  )
    throw new Error("Local database identity changed");
  return {
    projectRef: target.projectRef,
    fixtureId: target.fixtureId,
    systemIdentifier: target.systemIdentifier,
    backend: "local-postgres",
    syntheticOnly: true,
  };
}
await identity();
const origins = new Set(["http://127.0.0.1:59330", "http://127.0.0.1:59321"]);
Bun.serve({
  hostname: "0.0.0.0",
  port: 59321,
  async fetch(request) {
    const origin = request.headers.get("origin");
    if (origin && !origins.has(origin)) return new Response(null, { status: 403 });
    const cors = new Headers({
      "cache-control": "no-store",
      "access-control-allow-methods": "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
      "access-control-allow-headers":
        "authorization,apikey,content-type,x-client-info,x-supabase-api-version,prefer,range,x-upsert",
      "access-control-expose-headers": "content-range,range-unit,preference-applied",
    });
    if (origin) cors.set("access-control-allow-origin", origin);
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    try {
      const checked = await identity();
      const incoming = new URL(request.url);
      if (incoming.pathname === "/__local_identity")
        return Response.json(checked, { headers: cors });
      const services = [
        ["/auth/v1", "http://auth:9999"],
        ["/rest/v1", "http://rest:3000"],
        ["/storage/v1", "http://storage:5000"],
      ];
      const service = services.find(([prefix]) => incoming.pathname.startsWith(prefix + "/"));
      if (!service) return new Response(null, { status: 404, headers: cors });
      const destination = new URL(service[1]);
      destination.pathname = incoming.pathname.slice(service[0].length);
      destination.search = incoming.search;
      const headers = new Headers(request.headers);
      headers.delete("host");
      headers.set("accept-encoding", "identity");
      const response = await fetch(destination, {
        method: request.method,
        headers,
        body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
        redirect: "manual",
      });
      const outgoing = new Headers(response.headers);
      outgoing.delete("content-encoding");
      outgoing.delete("content-length");
      cors.forEach((value, key) => outgoing.set(key, value));
      return new Response(response.body, { status: response.status, headers: outgoing });
    } catch {
      return Response.json(
        { error: "Local acceptance gateway unavailable" },
        { status: 503, headers: cors },
      );
    }
  },
});
console.info(JSON.stringify({ event: "local_acceptance_gateway_ready", ...(await identity()) }));
