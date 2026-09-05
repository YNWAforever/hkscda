import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalPipeline } from "../../../components/admin/adoptions/AnimalPipeline";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

const searchSchema = z.object({
  animalId: z.string().optional(),
});

export const Route = createFileRoute("/admin/coordinator/animals")({
  validateSearch: searchSchema,
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("animals", context.queryClient);
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
