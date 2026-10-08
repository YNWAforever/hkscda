import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/pageHead";

import { PublicFormFrame } from "../components/site/PublicFormFrame";
import { PledgeStatusPage } from "../components/site/sponsorship/PledgeStatusPage";

export const Route = createFileRoute("/sponsors_/status/$token")({
  head: () => pageHead({ title: "助養狀態", private: true }),
  component: SponsorshipStatusRoute,
});

function SponsorshipStatusRoute() {
  const { token } = Route.useParams();
  return <SponsorshipStatusView token={token} />;
}

export function SponsorshipStatusView({ token }: { token: string }) {
  return (
    <PublicFormFrame trustNote="此為私人查閱連結，請勿轉發。">
      <PledgeStatusPage token={token} />
    </PublicFormFrame>
  );
}
