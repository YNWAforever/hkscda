import { createFileRoute } from "@tanstack/react-router";

import { CaseDetail } from "../../../components/admin/adoptions/CaseDetail";

export const Route = createFileRoute("/admin/applications/$id")({
  component: AdminApplicationDetailPage,
});

function AdminApplicationDetailPage() {
  const { id } = Route.useParams();

  return <CaseDetail caseId={id} />;
}
