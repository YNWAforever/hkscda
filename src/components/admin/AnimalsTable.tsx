import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "../../lib/supabase";
import type { Animal } from "../../types/animal";
import { DataTable, type DataTableColumn } from "./DataTable";
import { StatusPill, type StatusTone } from "./StatusBadge";

interface AnimalsTableProps {
  animals: Animal[];
  onDeleted: () => void;
}

const statusLabels: Record<string, { label: string; tone: StatusTone }> = {
  available: { label: "可領養", tone: "success" },
  adopted: { label: "已領養", tone: "warning" },
  fostered: { label: "暫托中", tone: "info" },
};

function AnimalStatus({ status }: { status: string }) {
  const meta = statusLabels[status];
  return <StatusPill tone={meta?.tone ?? "neutral"}>{meta?.label ?? status}</StatusPill>;
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
  const [search, setSearch] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const filtered = animals.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.name_en ?? "").toLowerCase().includes(search.toLowerCase()),
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
          流程
        </Link>
        <Link
          to="/admin/animals/$id/edit"
          params={{ id: animal.id }}
          className="text-xs text-[var(--color-panel)] hover:underline"
        >
          編輯
        </Link>
        {confirmDelete === animal.id ? (
          <span className="flex gap-2 text-xs">
            <button
              onClick={() => handleDelete(animal.id)}
              className="text-[var(--color-error)] hover:underline"
            >
              確認
            </button>
            <button
              onClick={() => setConfirmDelete(null)}
              className="text-[var(--color-text-muted)] hover:underline"
            >
              取消
            </button>
          </span>
        ) : (
          <button
            onClick={() => setConfirmDelete(animal.id)}
            className="text-xs text-[var(--color-error)] hover:underline"
          >
            刪除
          </button>
        )}
      </div>
    );
  }

  const columns: DataTableColumn<Animal>[] = [
    {
      id: "photo",
      header: "照片",
      cell: (animal) => <AnimalAvatar animal={animal} />,
    },
    {
      id: "name",
      header: "名字",
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
      header: "性別",
      cell: (animal) => (animal.gender === "male" ? "公" : "母"),
    },
    {
      id: "age",
      header: "年齡",
      cell: (animal) => animal.age,
    },
    {
      id: "status",
      header: "狀態",
      cell: (animal) => <AnimalStatus status={animal.status} />,
    },
    {
      id: "actions",
      header: "操作",
      cell: (animal) => <AnimalActions animal={animal} />,
    },
  ];

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="搜尋名字…"
        className="w-full max-w-xs rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm"
      />

      <DataTable
        columns={columns}
        rows={filtered}
        getRowKey={(animal) => animal.id}
        empty="沒有結果"
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
                {animal.gender === "male" ? "公" : "母"} · {animal.age}
              </p>
              <AnimalActions animal={animal} />
            </div>
          </div>
        )}
      />
    </div>
  );
}
