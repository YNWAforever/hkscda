import { createFileRoute } from "@tanstack/react-router";

import { StatusPage } from "../../components/site/adoption/StatusPage";

export const Route = createFileRoute("/adoption/status/$token")({
  component: AdoptionStatusRoute,
});

function AdoptionStatusRoute() {
  const { token } = Route.useParams();
  return <StatusPage token={token} />;
}
