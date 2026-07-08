import { describe, expect, test } from "bun:test";

import type { AnimalPipelineRow } from "./animalPipelineLogic";
import {
  buildAnimalTaskSearchParams,
  buildAnimalPipelineSearchParams,
  filterAnimalPipelineRows,
  groupAnimalPipelineRows,
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

  test("builds open task search params for an animal id", () => {
    expect(buildAnimalTaskSearchParams({ animalId: " animal-1 " }).toString()).toBe(
      "animalId=animal-1&openOnly=true&page=1&pageSize=10",
    );
    expect(buildAnimalTaskSearchParams({ animalId: "" }).toString()).toBe(
      "openOnly=true&page=1&pageSize=10",
    );
  });
});
