import { describe, expect, test } from "bun:test";

import type { AnimalInternalProfile } from "../../../lib/adoptions/types";
import type { AnimalPipelineRow } from "./animalPipelineLogic";
import {
  buildAnimalPipelineExportSearchParams,
  hasUnsavedProfileChanges,
  buildAnimalTaskSearchParams,
  buildAnimalPipelineSearchParams,
  filterAnimalPipelineRows,
  groupAnimalPipelineRows,
  resolveAnimalPipelinePagination,
} from "./animalPipelineLogic";

function row(overrides: Partial<AnimalPipelineRow> = {}): AnimalPipelineRow {
  return {
    id: "animal-1",
    type: "cat",
    name: "Mochi",
    name_en: null,
    gender: "female",
    age: "2歲",
    status: "available",
    image_url: null,
    created_at: "2026-06-01T00:00:00Z",
    updated_at: "2026-06-01T00:00:00Z",
    profile: {
      animal_id: "animal-1",
      internal_code: "CAT-001",
      arrival_date: "2026-05-01",
      arrival_source_id: null,
      current_position_id: null,
      cage: null,
      has_chip: null,
      chip_remarks: null,
      is_desexed: null,
      desexed_at: null,
      desex_remarks: null,
      is_adoptable: true,
      is_inside_support_pool: false,
      adopted_at: null,
      deceased_at: null,
      internal_remarks: null,
    },
    currentPosition: null,
    arrivalSource: null,
    ...overrides,
  };
}

describe("animal pipeline logic", () => {
  test("filters by lifecycle status, type, adoptable flag, support pool flag, and position", () => {
    const shelterId = "shelter-position";
    const fosterId = "foster-position";
    const rows = [
      row({
        id: "eligible-cat",
        type: "cat",
        status: "available",
        profile: {
          ...row().profile,
          animal_id: "eligible-cat",
          current_position_id: shelterId,
          is_adoptable: true,
          is_inside_support_pool: false,
        },
        currentPosition: { id: shelterId, name: "Shelter A", type: "shelter" },
      }),
      row({
        id: "wrong-position",
        profile: {
          ...row().profile,
          animal_id: "wrong-position",
          current_position_id: fosterId,
        },
        currentPosition: { id: fosterId, name: "Foster", type: "foster" },
      }),
      row({
        id: "wrong-status",
        status: "adopted",
        profile: { ...row().profile, animal_id: "wrong-status", current_position_id: shelterId },
      }),
      row({
        id: "wrong-pool",
        profile: {
          ...row().profile,
          animal_id: "wrong-pool",
          current_position_id: shelterId,
          is_inside_support_pool: true,
        },
      }),
    ];

    expect(
      filterAnimalPipelineRows(rows, {
        status: "available",
        type: "cat",
        adoptable: "adoptable",
        supportPool: "outside",
        positionId: shelterId,
      }).map((animal) => animal.id),
    ).toEqual(["eligible-cat"]);
  });

  test("groups rows by lifecycle status in operational order", () => {
    const rows = [
      row({ id: "adopted", status: "adopted" }),
      row({ id: "available", status: "available" }),
      row({ id: "fostered", status: "fostered" }),
    ];

    expect(groupAnimalPipelineRows(rows, "status").map((group) => group.key)).toEqual([
      "available",
      "fostered",
      "adopted",
    ]);
  });

  test("groups rows by current position with a fallback bucket", () => {
    const position = { id: "shelter-position", name: "Shelter A", type: "shelter" };
    const rows = [
      row({ id: "unassigned", profile: { ...row().profile, animal_id: "unassigned" } }),
      row({
        id: "assigned",
        profile: {
          ...row().profile,
          animal_id: "assigned",
          current_position_id: position.id,
        },
        currentPosition: position,
      }),
    ];

    expect(groupAnimalPipelineRows(rows, "position")).toEqual([
      {
        key: position.id,
        label: "Shelter A",
        rows: [rows[1]],
      },
      {
        key: "unassigned",
        label: "No position",
        rows: [rows[0]],
      },
    ]);
  });

  test("builds animal pipeline list search params with normalized ordering", () => {
    expect(
      buildAnimalPipelineSearchParams({
        q: " Mochi ",
        status: "available",
        type: "cat",
        adoptable: "adoptable",
        supportPool: "outside",
        positionId: "none",
        page: 2,
        pageSize: 50,
      }).toString(),
    ).toBe(
      "q=Mochi&status=available&type=cat&adoptable=adoptable&supportPool=outside&positionId=none&page=2&pageSize=50",
    );

    expect(
      buildAnimalPipelineSearchParams({
        animalId: "  animal-1  ",
      }).toString(),
    ).toBe("animalId=animal-1&page=1&pageSize=25");
  });

  test("builds animal pipeline export params without list pagination", () => {
    expect(
      buildAnimalPipelineExportSearchParams({
        q: " Foster ",
        status: "fostered",
        type: "cat",
        adoptable: "not_adoptable",
        supportPool: "inside",
        positionId: "none",
        page: 3,
        pageSize: 10,
      }).toString(),
    ).toBe(
      "q=Foster&status=fostered&type=cat&adoptable=not_adoptable&supportPool=inside&positionId=none",
    );
  });

  test("builds open task search params for an animal id", () => {
    expect(buildAnimalTaskSearchParams({ animalId: " animal-1 " }).toString()).toBe(
      "animalId=animal-1&openOnly=true&page=1&pageSize=10",
    );
    expect(buildAnimalTaskSearchParams({ animalId: "" }).toString()).toBe(
      "openOnly=true&page=1&pageSize=10",
    );
  });

  test("clamps animal pipeline pagination when the returned total shrinks", () => {
    expect(
      resolveAnimalPipelinePagination({
        page: 2,
        pageSize: 25,
        responsePage: 2,
        responsePageSize: 25,
        total: 0,
      }),
    ).toEqual({ page: 1, pageSize: 25, totalPages: 1 });
  });
});

describe("hasUnsavedProfileChanges", () => {
  const saved: AnimalInternalProfile = {
    animal_id: "animal-1",
    internal_code: "CAT-204",
    arrival_date: "2026-06-15",
    arrival_source_id: null,
    current_position_id: null,
    cage: null,
    has_chip: false,
    chip_remarks: null,
    is_desexed: true,
    desexed_at: null,
    desex_remarks: null,
    is_adoptable: true,
    is_inside_support_pool: false,
    adopted_at: null,
    deceased_at: null,
    internal_remarks: null,
  };

  test("reports an edited field as unsaved", () => {
    expect(hasUnsavedProfileChanges({ ...saved, cage: "A-12" }, saved)).toBe(true);
  });

  test("treats a never-touched empty field as unchanged", () => {
    // The server sends null; the input renders `value={... ?? ""}` and writes
    // back "" the moment the field is focused and blurred. Comparing raw values
    // would call that dirty, so merely tabbing through the form would raise the
    // discard prompt — which teaches operators to dismiss it on sight.
    expect(hasUnsavedProfileChanges({ ...saved, cage: "" }, saved)).toBe(false);
    expect(hasUnsavedProfileChanges({ ...saved, internal_remarks: "" }, saved)).toBe(false);
  });

  test("still reports clearing a field that had a value", () => {
    // The mirror case: internal_code was "CAT-204", so emptying it is a real
    // edit and must not be normalised away.
    expect(hasUnsavedProfileChanges({ ...saved, internal_code: "" }, saved)).toBe(true);
    expect(hasUnsavedProfileChanges({ ...saved, internal_code: null }, saved)).toBe(true);
  });

  test("reports no changes for an untouched form", () => {
    expect(hasUnsavedProfileChanges({ ...saved }, saved)).toBe(false);
  });

  test("compares booleans without normalising false to unset", () => {
    // has_chip is boolean | null: false means "confirmed no chip", null means
    // "not yet checked". Collapsing them would hide a real edit.
    expect(hasUnsavedProfileChanges({ ...saved, has_chip: null }, saved)).toBe(true);
    expect(hasUnsavedProfileChanges({ ...saved, is_adoptable: false }, saved)).toBe(true);
  });
});
