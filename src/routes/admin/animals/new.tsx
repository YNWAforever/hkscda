import { createFileRoute } from "@tanstack/react-router";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalForm } from "../../../components/admin/AnimalForm";
import { useAdminLanguage } from "../../../components/admin/adminI18n";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";

export const Route = createFileRoute("/admin/animals/new")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("animals", context.queryClient);
  },
  component: NewAnimalPage,
});

function NewAnimalPage() {
  return (
    <AdminLayout activeSection="cat">
      <NewAnimalContent />
    </AdminLayout>
  );
}

function NewAnimalContent() {
  const { copy } = useAdminLanguage();

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-xl font-bold">{copy.form.addTitle}</h1>
      <AnimalForm />
    </div>
  );
}
