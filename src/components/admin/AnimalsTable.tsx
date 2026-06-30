import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { Cat, Dog } from "lucide-react";
import { supabase } from "../../lib/supabase";
import type { Animal } from "../../types/animal";
import { useAdminLanguage } from "./adminI18n";

interface AnimalsTableProps {
  animals: Animal[];
  onDeleted: () => void;
}

const statusClasses: Record<string, string> = {
  available: "bg-green-100 text-green-700",
  adopted: "bg-orange-100 text-orange-700",
  fostered: "bg-blue-100 text-blue-700",
};

export function AnimalsTable({ animals, onDeleted }: AnimalsTableProps) {
  const { copy } = useAdminLanguage();
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

  return (
    <div className="space-y-4">
      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={copy.table.search}
        className="border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] rounded-lg px-3 py-2 text-sm w-full max-w-xs focus:outline-none focus:border-[var(--color-primary)] focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-100 text-gray-600 text-xs uppercase">
              <th className="text-left p-3">{copy.table.photo}</th>
              <th className="text-left p-3">{copy.table.name}</th>
              <th className="text-left p-3">{copy.table.gender}</th>
              <th className="text-left p-3">{copy.table.age}</th>
              <th className="text-left p-3">{copy.table.status}</th>
              <th className="text-left p-3">{copy.table.actions}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((animal) => {
              return (
                <tr key={animal.id} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="p-3">
                    {animal.image_url ? (
                      <img
                        src={animal.image_url}
                        alt=""
                        className="w-10 h-10 rounded object-cover"
                      />
                    ) : (
                      <div className="w-10 h-10 rounded bg-gray-100 flex items-center justify-center text-gray-400">
                        {animal.type === "dog" ? (
                          <Dog className="h-5 w-5" aria-hidden="true" />
                        ) : (
                          <Cat className="h-5 w-5" aria-hidden="true" />
                        )}
                      </div>
                    )}
                  </td>
                  <td className="p-3 font-medium">
                    {animal.name}
                    {animal.name_en && (
                      <span className="text-gray-400 ml-1 font-normal">{animal.name_en}</span>
                    )}
                  </td>
                  <td className="p-3">{copy.gender[animal.gender]}</td>
                  <td className="p-3">{animal.age}</td>
                  <td className="p-3">
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusClasses[animal.status]}`}
                    >
                      {copy.animalStatus[animal.status]}
                    </span>
                  </td>
                  <td className="p-3">
                    <div className="flex gap-3">
                      <Link
                        to="/admin/animals/$id/edit"
                        params={{ id: animal.id }}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        {copy.common.edit}
                      </Link>
                      {confirmDelete === animal.id ? (
                        <span className="flex gap-2 text-xs">
                          <button
                            onClick={() => handleDelete(animal.id)}
                            className="text-red-600 hover:underline"
                          >
                            {copy.common.confirm}
                          </button>
                          <button
                            onClick={() => setConfirmDelete(null)}
                            className="text-gray-500 hover:underline"
                          >
                            {copy.common.cancel}
                          </button>
                        </span>
                      ) : (
                        <button
                          onClick={() => setConfirmDelete(animal.id)}
                          className="text-red-500 hover:underline text-xs"
                        >
                          {copy.common.delete}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-6 text-center text-gray-400">
                  {copy.common.noResults}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
