import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../../lib/supabase";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalForm } from "../../../components/admin/AnimalForm";

export const Route = createFileRoute("/admin/animals/$id/edit")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
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

  if (isLoading) return <div className="p-6 text-gray-400">載入中…</div>;
  if (!animal) return <div className="p-6 text-gray-400">找不到此動物</div>;

  return (
    <AdminLayout activeSection={animal.type as "cat" | "dog" | "sponsor" | "applications"}>
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-bold">編輯：{animal.name}</h1>
        <AnimalForm existing={animal} />
      </div>
    </AdminLayout>
  );
}
