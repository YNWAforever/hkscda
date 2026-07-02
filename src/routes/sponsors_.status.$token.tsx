import { createFileRoute } from "@tanstack/react-router";

import { PledgeStatusPage } from "../components/site/sponsorship/PledgeStatusPage";

export const Route = createFileRoute("/sponsors_/status/$token")({
  component: SponsorshipStatusRoute,
});

function SponsorshipStatusRoute() {
  const { token } = Route.useParams();
  return <PledgeStatusPage token={token} />;
}
