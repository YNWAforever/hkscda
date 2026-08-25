import { createFileRoute } from "@tanstack/react-router";

import { ApplicationWizard } from "../../components/site/adoption/ApplicationWizard";

export const Route = createFileRoute("/adoption/apply")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.vercel.app/adoption/apply" }],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  return <ApplicationWizard />;
}
