import { authorizedCron } from "../volunteers/jobs/auth.server";
export function createSponsorshipCron(deps: {
  secret: () => string | undefined;
  actor: () => string | undefined;
  run: (actor: string) => Promise<unknown>;
}) {
  return async (request: Request) => {
    if (!authorizedCron(request, deps.secret()))
      return Response.json({ error: "unauthorized" }, { status: 401 });
    const actor = deps.actor();
    if (!actor)
      return Response.json(
        { status: "disabled", reason: "job_actor_unconfigured" },
        { headers: { "cache-control": "no-store" } },
      );
    return Response.json(await deps.run(actor), { headers: { "cache-control": "no-store" } });
  };
}
