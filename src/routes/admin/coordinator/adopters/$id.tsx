import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { AdminLayout } from "../../../../components/admin/AdminLayout";
import { AdopterDetail } from "../../../../components/admin/adoptions/AdopterDetail";
import { supabase } from "../../../../lib/supabase";

const paramsSchema = z.object({
  id: z.string().uuid(),
});

export const Route = createFileRoute("/admin/coordinator/adopters/$id")({
  parseParams: paramsSchema.parse,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
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
