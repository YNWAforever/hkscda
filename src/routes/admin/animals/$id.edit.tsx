import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalForm } from "../../../components/admin/AnimalForm";
import { useAdminLanguage } from "../../../components/admin/adminI18n";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
import type { Animal } from "../../../types/animal";

export const Route = createFileRoute("/admin/animals/$id/edit")({
  beforeLoad: async () => {
    await requireAdminPageAccess("animals");
  },
  component: EditAnimalPage,
});

function EditAnimalPage() {
  const { id } = Route.useParams();

  const { data: animal, isLoading } = useQuery({
    queryKey: ["admin-animal", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("animals").select("*").eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });

  return (
    <AdminLayout
      activeSection={(animal?.type ?? "cat") as "cat" | "dog" | "sponsor" | "applications"}
    >
      <EditAnimalContent animal={animal} isLoading={isLoading} />
    </AdminLayout>
  );
}

function EditAnimalContent({ animal, isLoading }: { animal?: Animal | null; isLoading: boolean }) {
  const { copy } = useAdminLanguage();

  if (isLoading) return <div className="p-6 text-gray-400">{copy.common.loading}</div>;
  if (!animal) return <div className="p-6 text-gray-400">{copy.form.notFound}</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">
        {copy.form.editTitle}
        {animal.name}
      </h1>
      <AnimalForm existing={animal} />
    </div>
  );
}
