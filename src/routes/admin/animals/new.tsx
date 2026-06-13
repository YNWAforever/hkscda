import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabase } from "../../../lib/supabase";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalForm } from "../../../components/admin/AnimalForm";

export const Route = createFileRoute("/admin/animals/new")({
  beforeLoad: async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw redirect({ to: "/admin/login" });
  },
  component: NewAnimalPage,
});

function NewAnimalPage() {
  return (
    <AdminLayout activeSection="cat">
      <div className="p-6 space-y-4">
        <h1 className="text-xl font-bold">新增動物</h1>
        <AnimalForm />
      </div>
    </AdminLayout>
  );
}
