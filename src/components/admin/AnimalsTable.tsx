import { Link } from "@tanstack/react-router";
import { useState } from "react";

import { fetchAdminJson } from "../../lib/admin/session";
import { isArchivedAnimal } from "../../lib/animals/adminSearch";
import {
  getAnimalListPage,
  updateAnimalListFilters,
  animalListStatuses,
  animalListDefaults,
  type AnimalListState,
} from "../../lib/animals/adminListState";
import { needsSpeciesVerification } from "../../lib/animals/adminCatalogue";
import type { Animal, AnimalPublicationState } from "../../types/animal";
import { DataTable, type DataTableColumn } from "./DataTable";
import { StatusPill, type StatusTone } from "./StatusBadge";
import { useAdminLanguage } from "./adminI18n";
import { animalListCopy } from "./animalListCopy";
import { useAdminCopy } from "./i18n/copy";
import { englishAlongside, localizedText } from "./i18n/localizedText";

interface AnimalsTableProps {
  animals: Animal[];
  serverTotal?: number;
  state: AnimalListState;
  onStateChange: (state: AnimalListState) => void;
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

const publicationTones: Record<AnimalPublicationState, StatusTone> = {
  draft: "neutral",
  published: "success",
  unpublished: "warning",
};

function AnimalPublication({ state }: { state: AnimalPublicationState }) {
  const labels = useAdminCopy(animalListCopy).publication;
  return <StatusPill tone={publicationTones[state]}>{labels[state]}</StatusPill>;
}

function AnimalAvatar({ animal }: { animal: Animal }) {
  if (animal.image_url) {
    return (
      <img
        loading="lazy"
        decoding="async"
        width={40}
        height={40}
        src={animal.image_url}
        alt=""
        className="h-10 w-10 rounded object-cover"
      />
    );
  }
  return (
    <div className="flex h-10 w-10 items-center justify-center rounded bg-[var(--color-surface-2)] text-lg">
      {animal.type === "dog" ? "🐶" : "🐱"}
    </div>
  );
}

export function AnimalsTable({
  animals,
  serverTotal,
  onDeleted,
  state,
  onStateChange,
}: AnimalsTableProps) {
  const { copy, language } = useAdminLanguage();
  const text = useAdminCopy(animalListCopy);
  const changeFilters = (filters: Partial<Omit<AnimalListState, "page">>) =>
    onStateChange(updateAnimalListFilters(state, filters));
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Searching matched only names, so the reference number printed on an
  // animal's own public page found nothing. Archived records are excluded by
  // default but stay reachable through the toggle: a retired animal still needs
  // correcting, and its applications and sponsorships still point at it.
  const list =
    serverTotal === undefined
      ? getAnimalListPage(animals, state)
      : {
          rows: animals,
          filtered: animals,
          total: serverTotal,
          page: state.page,
          pageCount: Math.max(1, Math.ceil(serverTotal / 20)),
        };
  const filtered = list.filtered;
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
    try {
      await fetchAdminJson("/api/admin/animals/" + encodeURIComponent(id) + "/archive", {
        method: "POST",
        body: JSON.stringify({ archived: !archived }),
      });
    } catch {
      setActionError(archived ? text.unarchiveFailed : text.archiveFailed);
      return;
    }
    setConfirmDelete(null);
    onDeleted();
  }

  function AnimalActions({ animal }: { animal: Animal }) {
    return (
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <Link
          to="/admin/coordinator/animals"
          search={{ animalId: animal.id }}
          className="inline-flex min-h-11 items-center px-1 text-xs text-[var(--color-primary)] hover:underline"
        >
          {copy.common.workflow}
        </Link>
        <Link
          to="/admin/animals/$id/edit"
          params={{ id: animal.id }}
          className="inline-flex min-h-11 items-center px-1 text-xs text-[var(--color-panel)] hover:underline"
        >
          {copy.common.edit}
        </Link>
        {isArchivedAnimal(animal) ? (
          <button
            type="button"
            onClick={() => handleArchive(animal.id, true)}
            className="inline-flex min-h-11 items-center px-1 text-xs text-[var(--color-primary)] hover:underline"
          >
            {text.unarchive}
          </button>
        ) : confirmDelete === animal.id ? (
          <span className="flex flex-wrap items-center gap-2 text-xs">
            <button
              type="button"
              onClick={() => handleArchive(animal.id, false)}
              className="inline-flex min-h-11 items-center px-1 text-[var(--color-error)] hover:underline"
            >
              {copy.common.confirm}
            </button>
            <button
              type="button"
              onClick={() => setConfirmDelete(null)}
              className="inline-flex min-h-11 items-center px-1 text-[var(--color-text-muted)] hover:underline"
            >
              {copy.common.cancel}
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(animal.id)}
            className="inline-flex min-h-11 items-center px-1 text-xs text-[var(--color-error)] hover:underline"
            title={text.archiveHint}
          >
            {text.archive}
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
          {localizedText(animal.name, animal.name_en, language)}
          {(animal.code ?? animal.public_profile?.code) ? (
            <span className="ml-2 text-xs text-[var(--color-text-muted)]">
              #{animal.code ?? animal.public_profile?.code}
            </span>
          ) : null}
          {englishAlongside(animal.name_en, language) && (
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
      cell: (animal) => localizedText(animal.age, animal.age_en, language),
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
      header: text.publicationHeader,
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
          value={state.q}
          onChange={(event) => changeFilters({ q: event.target.value })}
          placeholder={text.search}
          aria-label={text.search}
          className="min-h-11 w-full max-w-xs rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text)] shadow-sm focus:border-[var(--color-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary-highlight)]"
        />
        <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
          {copy.table.status}
          <select
            value={state.status}
            onChange={(event) =>
              changeFilters({ status: event.target.value as AnimalListState["status"] })
            }
            className="min-h-11 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 text-[var(--color-text)]"
          >
            {animalListStatuses.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? text.allStatuses : copy.animalStatus[status]}
              </option>
            ))}
          </select>
        </label>
        {state.q || state.archived || state.status !== "all" ? (
          <button
            type="button"
            onClick={() => onStateChange({ ...animalListDefaults })}
            className="min-h-11 rounded-lg border border-[var(--color-border)] px-3 text-sm text-[var(--color-panel)]"
          >
            {text.clearFilters}
          </button>
        ) : null}
        {archivedCount > 0 || state.archived ? (
          <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
            <input
              type="checkbox"
              checked={state.archived}
              onChange={(event) => changeFilters({ archived: event.target.checked })}
              className="h-4 w-4"
            />
            {text.archived} ({archivedCount})
          </label>
        ) : null}
      </div>

      {needsSpeciesCount > 0 ? (
        <p className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-text-muted)]">
          {text.needsSpecies(needsSpeciesCount)}
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-sm text-[var(--color-error)]">
          {actionError}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={list.rows}
        getRowKey={(animal) => animal.id}
        empty={animals.length === 0 ? text.empty : text.noResults}
        renderMobileCard={(animal) => (
          <div className="flex items-start gap-3">
            <AnimalAvatar animal={animal} />
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate font-medium">
                  {localizedText(animal.name, animal.name_en, language)}
                  {englishAlongside(animal.name_en, language) && (
                    <span className="ml-1 font-normal text-[var(--color-text-muted)]">
                      {animal.name_en}
                    </span>
                  )}
                </span>
                <AnimalStatus status={animal.status} />
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">
                {copy.gender[animal.gender]} · {localizedText(animal.age, animal.age_en, language)}
              </p>
              <AnimalActions animal={animal} />
            </div>
          </div>
        )}
      />
      {list.total > 0 ? (
        <nav
          aria-label={text.pagination}
          className="flex flex-wrap items-center justify-between gap-3 text-sm"
        >
          <p aria-live="polite">{text.summary(list.total, list.page, list.pageCount)}</p>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={list.page <= 1}
              onClick={() => onStateChange({ ...state, page: list.page - 1 })}
              className="min-h-11 rounded-lg border border-[var(--color-border)] px-3 disabled:opacity-50"
            >
              {text.previous}
            </button>
            <button
              type="button"
              disabled={list.page >= list.pageCount}
              onClick={() => onStateChange({ ...state, page: list.page + 1 })}
              className="min-h-11 rounded-lg border border-[var(--color-border)] px-3 disabled:opacity-50"
            >
              {text.next}
            </button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}
