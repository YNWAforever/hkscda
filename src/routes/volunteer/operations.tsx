import { createFileRoute } from "@tanstack/react-router";
import { VolunteerOperations } from "../../components/admin/volunteers/VolunteerOperations";
export const Route = createFileRoute("/volunteer/operations")({
  ssr: false,
  component: () => <VolunteerOperations publicMode />,
});
