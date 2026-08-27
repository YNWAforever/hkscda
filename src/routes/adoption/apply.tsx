import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { ApplicationWizard } from "../../components/site/adoption/ApplicationWizard";

export const Route = createFileRoute("/adoption/apply")({
  head: () => ({
    links: [{ rel: "canonical", href: publicUrl("/adoption/apply") }],
  }),
  component: ApplyPage,
});

function ApplyPage() {
  return <ApplicationWizard />;
}
