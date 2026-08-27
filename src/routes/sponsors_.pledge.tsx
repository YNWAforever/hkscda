import { createFileRoute } from "@tanstack/react-router";
import { publicUrl } from "@/lib/publicOrigin";

import { PledgeWizard } from "../components/site/sponsorship/PledgeWizard";

export const Route = createFileRoute("/sponsors_/pledge")({
  head: () => ({
    links: [{ rel: "canonical", href: publicUrl("/sponsors/pledge") }],
  }),
  component: PledgeWizard,
});
