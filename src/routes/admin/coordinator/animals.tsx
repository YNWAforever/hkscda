import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalPipeline } from "../../../components/admin/adoptions/AnimalPipeline";
import { supabase } from "../../../lib/supabase";

const searchSchema = z.object({
  animalId: z.string().optional(),
});

export const Route = createFileRoute("/admin/coordinator/animals")({
  validateSearch: searchSchema,
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: CoordinatorAnimalsPage,
});

function CoordinatorAnimalsPage() {
  const { animalId } = Route.useSearch();

  return (
    <AdminLayout activeSection="applications">
      <AnimalPipeline initialAnimalId={animalId} />
    </AdminLayout>
  );
}
