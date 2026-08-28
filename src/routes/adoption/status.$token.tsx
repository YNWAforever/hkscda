import { createFileRoute } from "@tanstack/react-router";

import { PublicFormFrame } from "../../components/site/PublicFormFrame";
import { StatusPage } from "../../components/site/adoption/StatusPage";

export const Route = createFileRoute("/adoption/status/$token")({
  head: () => ({
    meta: [
      { name: "robots", content: "noindex, nofollow, noarchive" },
      { name: "referrer", content: "no-referrer" },
    ],
  }),
  component: AdoptionStatusRoute,
});

function AdoptionStatusRoute() {
  const { token } = Route.useParams();
  return <AdoptionStatusView token={token} />;
}

export function AdoptionStatusView({ token }: { token: string }) {
  return (
    <PublicFormFrame trustNote="此為私人查閱連結，請勿轉發。">
      <StatusPage token={token} />
    </PublicFormFrame>
  );
}
