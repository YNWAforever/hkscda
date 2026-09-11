import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { supabase } from "../../lib/supabase";
import { filterAdminAnimals, isArchivedAnimal } from "../../lib/animals/adminSearch";
import { needsSpeciesVerification } from "../../lib/animals/adminCatalogue";
import type { Animal, AnimalPublicationState } from "../../types/animal";
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

const publicationLabels: Record<AnimalPublicationState, string> = {
  draft: "草稿",
  published: "已公開",
  unpublished: "暫停公開",
};

const publicationTones: Record<AnimalPublicationState, StatusTone> = {
  draft: "neutral",
  published: "success",
  unpublished: "warning",
};

function AnimalPublication({ state }: { state: AnimalPublicationState }) {
  return <StatusPill tone={publicationTones[state]}>{publicationLabels[state]}</StatusPill>;
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
  const [includeArchived, setIncludeArchived] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Searching matched only names, so the reference number printed on an
  // animal's own public page found nothing. Archived records are excluded by
  // default but stay reachable through the toggle: a retired animal still needs
  // correcting, and its applications and sponsorships still point at it.
  const filtered = filterAdminAnimals(animals, search, { includeArchived });
  const archivedCount = animals.filter(isArchivedAnimal).length;
  // Species must be cat or dog. These still carry the legacy 'sponsor'
  // placeholder and need a human to say which -- it cannot be derived, and
  // guessing from a name is exactly the incorrect matching the plan forbids.
  const needsSpeciesCount = filtered.filter(needsSpeciesVerification).length;

  /**
   * Archives instead of deleting.
   *
   * `.delete()` on an animal was both destructive and dishonest. Nine tables
   * reference animals: `animal_profile_internal` (the internal medical and
   * behavioural record) and `animal_match` cascade, so a delete silently
   * destroyed them; `sponsorship_preference`, `adoption_followup` and
   * `adoption_application_animal_preference` are ON DELETE SET NULL, so the
   * record of which animal a sponsor actually chose was quietly erased. Where a
   * successful adoption, application or case existed the foreign key is
   * RESTRICT or NO ACTION, so the delete was rejected outright -- and the error
   * was never read, so the UI called onDeleted() and reported success while
   * nothing had happened.
   *
   * Retiring sets `retired_at` instead, which is what that column exists for:
   * it removes the animal from the working list and the public catalogues while
   * preserving every historical foreign key, the internal profile, and the
   * sponsorship and adoption history pointing at it.
   */
  async function handleArchive(id: string, archived: boolean) {
    setActionError(null);
    const { error } = await supabase
      .from("animals")
      .update({ retired_at: archived ? null : new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setActionError(archived ? "無法取消封存，請重試。" : "無法封存，請重試。");
      return;
    }
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
        {isArchivedAnimal(animal) ? (
          <button
            type="button"
            onClick={() => handleArchive(animal.id, true)}
            className="text-xs text-[var(--color-primary)] hover:underline"
          >
            取消封存
          </button>
        ) : confirmDelete === animal.id ? (
          <span className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleArchive(animal.id, false)}
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
            title="封存後不會在公開網站或預設列表顯示，但所有領養、助養及內部記錄會保留。"
          >
            封存
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
      // Shown beside the care state, not folded into it: an operator needs to
      // see at a glance that a record is available but withheld, which the two
      // columns together say and either one alone cannot.
      id: "publication",
      header: "公開狀態",
      cell: (animal) => <AnimalPublication state={animal.publication_state ?? "published"} />,
    },
    {
      id: "actions",
      header: copy.table.actions,
      cell: (animal) => <AnimalActions animal={animal} />,
    },
  ];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="搜尋名稱或編號"
          aria-label="搜尋名稱或編號"
          className="w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] shadow-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
        />
        {archivedCount > 0 ? (
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => setIncludeArchived(event.target.checked)}
              className="h-4 w-4"
            />
            顯示已封存記錄（{archivedCount}）
          </label>
        ) : null}
      </div>

      {needsSpeciesCount > 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
          有 {needsSpeciesCount} 筆記錄的品種仍是舊有的「助養」值，需要人手確認為貓或狗。
          更改品種不會影響領養／助養刊登範圍。
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {actionError}
        </p>
      ) : null}

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
