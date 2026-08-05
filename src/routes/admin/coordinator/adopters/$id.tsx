import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminLayout } from "../../../../components/admin/AdminLayout";
import { AdopterDetail } from "../../../../components/admin/adoptions/AdopterDetail";
import { requireAdminPageAccess } from "../../../../lib/admin/pageAccess";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export const Route = createFileRoute("/admin/coordinator/adopters/$id")({
  parseParams: paramsSchema.parse,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("adopters", context.queryClient);
  },
  component: CoordinatorAdopterDetailPage,
});

function CoordinatorAdopterDetailPage() {
  const { id } = Route.useParams();
  return (
    <AdminLayout activeSection="applications">
      <AdopterDetail adopterId={id} />
    </AdminLayout>
  );
}
