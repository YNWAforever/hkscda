import { createFileRoute } from "@tanstack/react-router";

import { CaseList } from "../../../components/admin/adoptions/CaseList";

export const Route = createFileRoute("/admin/applications/")({
  component: AdminApplicationsIndexPage,
});

function AdminApplicationsIndexPage() {
  return <CaseList />;
}
