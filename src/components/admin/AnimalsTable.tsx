import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "../../lib/supabase";
import type { Animal } from "../../types/animal";
import { DataTable, type DataTableColumn } from "./DataTable";
import { StatusPill, type StatusTone } from "./StatusBadge";
import { useAdminLanguage } from "./adminI18n";

interface AnimalsTableProps {
  animals: Animal[];
  onDeleted: () => void;
}

const statusTones: Record<string, StatusTone> = {
  available: "success",
  adopted: "warning",
  fostered: "info",
};

function AnimalStatus({ status }: { status: string }) {
  const { copy } = useAdminLanguage();
  const label =
    status in copy.animalStatus
      ? copy.animalStatus[status as keyof typeof copy.animalStatus]
      : status;
  return <StatusPill tone={statusTones[status] ?? "neutral"}>{label}</StatusPill>;
}

function AnimalAvatar({ animal }: { animal: Animal }) {
  if (animal.image_url) {
    return <img src={animal.image_url} alt="" className="h-10 w-10 rounded object-cover" />;
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--color-surface-2)] text-lg">
      {animal.type === "dog" ? "🐶" : "🐱"}
    </div>
  );
}

export function AnimalsTable({ animals, onDeleted }: AnimalsTableProps) {
  const { copy } = useAdminLanguage();
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = animals.filter(
    (animal) =>
      animal.name.toLowerCase().includes(search.toLowerCase()) ||
      (animal.name_en ?? "").toLowerCase().includes(search.toLowerCase()),
  );

  async function handleDelete(id: string) {
    await supabase.from("animals").delete().eq("id", id);
    setConfirmDelete(null);
    onDeleted();
  }

  function AnimalActions({ animal }: { animal: Animal }) {
    return (
      <div className="flex gap-3">
        <Link
          to="/admin/coordinator/animals"
          search={{ animalId: animal.id }}
          className="text-xs text-[var(--color-primary)] hover:underline"
        >
          {copy.common.workflow}
        </Link>
        <Link
          to="/admin/animals/$id/edit"
          params={{ id: animal.id }}
          className="text-xs text-[var(--color-panel)] hover:underline"
        >
          {copy.common.edit}
        </Link>
        {confirmDelete === animal.id ? (
          <span className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleDelete(animal.id)}
              className="text-[var(--color-error)] hover:underline"
            >
              {copy.common.confirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="text-[var(--color-text-muted)] hover:underline"
            >
              {copy.common.cancel}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(animal.id)}
            className="text-xs text-[var(--color-error)] hover:underline"
          >
            {copy.common.delete}
          </button>
        )}
      </div>
    );
  }

  const columns: DataTableColumn<Animal>[] = [
    {
      id: "photo",
      header: copy.table.photo,
      cell: (animal) => <AnimalAvatar animal={animal} />,
    },
    {
      id: "name",
      header: copy.table.name,
      cell: (animal) => (
        <span className="font-medium">
          {animal.name}
          {animal.name_en && (
            <span className="ml-1 font-normal text-[var(--color-text-muted)]">
              {animal.name_en}
            </span>
          )}
        </span>
      ),
    },
    {
      id: "gender",
      header: copy.table.gender,
      cell: (animal) => copy.gender[animal.gender],
    },
    {
      id: "age",
      header: copy.table.age,
      cell: (animal) => animal.age,
    },
    {
      id: "status",
      header: copy.table.status,
      cell: (animal) => <AnimalStatus status={animal.status} />,
    },
    {
      id: "actions",
      header: copy.table.actions,
      cell: (animal) => <AnimalActions animal={animal} />,
    },
  ];

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder={copy.table.search}
        className="w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] shadow-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
      />

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(animal) => animal.id}
        empty={copy.common.noResults}
        renderMobileCard={(animal) => (
          <div className="flex items-start gap-3">
            <AnimalAvatar animal={animal} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {animal.name}
                  {animal.name_en && (
                    <span className="ml-1 font-normal text-[var(--color-text-muted)]">
                      {animal.name_en}
                    </span>
                  )}
                </span>
                <AnimalStatus status={animal.status} />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                {copy.gender[animal.gender]} · {animal.age}
              </p>
              <AnimalActions animal={animal} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
