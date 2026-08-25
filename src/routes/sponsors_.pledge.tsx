import { createFileRoute } from "@tanstack/react-router";

import { PledgeWizard } from "../components/site/sponsorship/PledgeWizard";

export const Route = createFileRoute("/sponsors_/pledge")({
  head: () => ({
    links: [{ rel: "canonical", href: "https://hkscda.vercel.app/sponsors/pledge" }],
  }),
  component: PledgeWizard,
});
