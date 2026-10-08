import { createFileRoute } from "@tanstack/react-router";
import { pageHead } from "@/lib/pageHead";

import { PublicFormFrame } from "../../components/site/PublicFormFrame";
import { StatusPage } from "../../components/site/adoption/StatusPage";

export const Route = createFileRoute("/adoption/status/$token")({
  head: () => pageHead({ title: "申請狀態", private: true }),
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
