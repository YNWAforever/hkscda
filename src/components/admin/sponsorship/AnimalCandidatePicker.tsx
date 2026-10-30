import { useQuery } from "@tanstack/react-query";
import { useDeferredValue, useState } from "react";

import { fetchCoordinatorJson } from "../adoptions/api";
import { useAdminPageCopy } from "../adminPageCopy";
import { LoadFailure } from "../LoadFailure";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import {
  animalCandidateLabel,
  animalCandidatesFrom,
  animalCandidatesPath,
} from "./animalCandidates";

/**
 * Finds an animal to add to a pledge by name or code, from the eligible animals the server
 * lists, so staff never type an id (BUG-44). The results are a radio group: Tab reaches it and
 * the arrow keys move the choice.
 */
export function AnimalCandidatePicker({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (animalId: string) => void;
  disabled: boolean;
}) {
  const { language, pageCopy } = useAdminPageCopy();
  const copy = pageCopy.pledgeReview.assignments;
  const [query, setQuery] = useState("");
  const path = animalCandidatesPath(useDeferredValue(query));
  const candidates = useQuery({
    queryKey: ["sponsorship-assignment-candidates", path],
    queryFn: () => fetchCoordinatorJson<unknown>(path),
    enabled: !disabled,
    staleTime: 30_000,
  });
  const animals = animalCandidatesFrom(candidates.data);

  return (
    <div className="space-y-2">
      <Label htmlFor="pledge-assign-animal-search">{copy.searchLabel}</Label>
      <Input
        id="pledge-assign-animal-search"
        type="search"
        value={query}
        placeholder={copy.searchPlaceholder}
        maxLength={100}
        disabled={disabled}
        onChange={(event) => setQuery(event.target.value)}
      />
      {candidates.isError ? (
        <LoadFailure
          error={candidates.error}
          onRetry={() => void candidates.refetch()}
          title={copy.loadFailed}
        />
      ) : candidates.isLoading ? (
        <p role="status" className="text-sm text-[var(--color-text-muted)]">
          {copy.searching}
        </p>
      ) : animals.length === 0 ? (
        <p role="status" className="text-sm text-[var(--color-text-muted)]">
          {copy.noResults}
        </p>
      ) : (
        <fieldset disabled={disabled}>
          <legend className="sr-only">{copy.resultsLabel}</legend>
          <ul className="max-h-48 space-y-1 overflow-y-auto rounded-lg border border-[var(--color-border)] p-2">
            {animals.map((animal) => (
              <li key={animal.id}>
                <label className="flex min-h-11 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-[var(--color-muted)]">
                  <input
                    type="radio"
                    name="pledge-assign-animal"
                    value={animal.id}
                    checked={value === animal.id}
                    onChange={() => onChange(animal.id)}
                  />
                  <span>{animalCandidateLabel(animal, language)}</span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      )}
    </div>
  );
}
