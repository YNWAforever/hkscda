import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fetchAdminJson } from "../../../lib/admin/http";
import { AdminLayout } from "../../../components/admin/AdminLayout";
import { AnimalForm } from "../../../components/admin/AnimalForm";
import { useAdminLanguage } from "../../../components/admin/adminI18n";
import { requireAdminPageAccess } from "../../../lib/admin/pageAccess";
import type { Animal } from "../../../types/animal";
import { DestinationHeading } from "../../../components/admin/DestinationHeading";
import { LoadFailure } from "../../../components/admin/LoadFailure";

export const Route = createFileRoute("/admin/animals/$id/edit")({
  ssr: false,
  beforeLoad: async ({ context }) => {
    await requireAdminPageAccess("animals", context.queryClient);
  },
  component: EditAnimalPage,
});

function EditAnimalPage() {
  const { id } = Route.useParams();

  const {
    data: animal,
    isLoading,
    error,
    refetch,
  } = useQuery({
    queryKey: ["admin-animal", id],
    queryFn: async () => {
      const data = await fetchAdminJson<{ animal: Animal | null }>(
        "/api/admin/animals/publication/",
        { method: "POST", body: JSON.stringify({ kind: "read", animal_id: id }) },
      );
      return data.animal;
    },
  });

  return (
    <AdminLayout
      activeSection={(animal?.type ?? "cat") as "cat" | "dog" | "sponsor" | "applications"}
      recordName={animal?.name}
    >
      <EditAnimalContent
        animal={animal}
        isLoading={isLoading}
        error={error}
        onRetry={() => void refetch()}
      />
    </AdminLayout>
  );
}

export function EditAnimalContent({
  animal,
  isLoading,
  error,
  onRetry,
}: {
  animal?: Animal | null;
  isLoading: boolean;
  error: unknown;
  onRetry: () => void;
}) {
  const { copy } = useAdminLanguage();

  // Until the animal loads, the heading is the tab the breadcrumb names (the first tab by default).
  const destination = animal?.type ?? "cat";
  if (isLoading)
    return (
      <div className="space-y-3 p-6">
        <DestinationHeading id={destination} className="text-xl font-bold" />
        <p className="text-[var(--color-text-faint)]">{copy.common.loading}</p>
      </div>
    );
  // A failed read is not a missing animal: say which it was, and offer the retry.
  if (error)
    return (
      <div className="space-y-3 p-6">
        <DestinationHeading id={destination} className="text-xl font-bold" />
        <LoadFailure error={error} onRetry={onRetry} />
      </div>
    );
  if (!animal)
    return (
      <div className="space-y-3 p-6">
        <DestinationHeading id={destination} className="text-xl font-bold" />
        <p className="text-[var(--color-text-faint)]">{copy.form.notFound}</p>
      </div>
    );

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
