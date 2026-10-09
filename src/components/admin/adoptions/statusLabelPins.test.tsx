import { describe, expect, mock, test } from "bun:test";
import type { ReactElement, ReactNode } from "react";

import type {
  AdopterDetail as AdopterDetailData,
  AdoptionCaseDetail,
  AdoptionIntakeItem,
  AnimalPipelineRow,
  CoordinatorStatus,
  CoordinatorTask,
} from "../../../lib/adoptions/types";
import { renderAdminInChinese, renderAdminInEnglish } from "../i18n/testing";

/**
 * Every adoption status is drawn by the shared StatusBadge / StatusPill. These tests render
 * each site with a known status and pin the label inside the pill, in Chinese and in English,
 * so a change to the shared component (or a site going back to its own markup) cannot change
 * the wording staff read.
 */

process.env.VITE_SUPABASE_URL ??= "https://example.supabase.co";
process.env.VITE_SUPABASE_ANON_KEY ??= "test-anon-key";

const realReactRouter = await import("@tanstack/react-router");
const realReactQuery = await import("@tanstack/react-query");

type MockLinkProps = { children: ReactNode; className?: string; to: string };

mock.module("@tanstack/react-router", () => ({
  ...realReactRouter,
  Link: ({ children, className, to }: MockLinkProps) => (
    <a data-router-link="true" href={to} className={className}>
      {children}
    </a>
  ),
}));

/** What each query key answers with. A key that is not here answers with no data. */
const answers = new Map<string, unknown>();

mock.module("@tanstack/react-query", () => ({
  ...realReactQuery,
  useMutation: () => ({ mutate: () => {}, isPending: false, isError: false }),
  useQueryClient: () => ({ invalidateQueries: async () => {} }),
  useQuery: ({ queryKey }: { queryKey: readonly unknown[] }) => ({
    data: answers.get(String(queryKey[0])),
    error: null,
    isError: false,
    isLoading: false,
    isFetching: false,
    refetch: () => {},
  }),
}));

const { AdopterDetail } = await import("./AdopterDetail");
const { CaseDetail } = await import("./CaseDetail");
const { MatchPanel } = await import("./MatchPanel");
const { TaskPanel } = await import("./TaskPanel");
const { IntakeInbox } = await import("./IntakeInbox");
const { AnimalPipeline } = await import("./AnimalPipeline");

function status(key: string, labelZh: string, labelEn: string, color: string): CoordinatorStatus {
  return {
    id: `status-${key}`,
    category: "match",
    key,
    labelZh,
    labelEn,
    sortOrder: 1,
    color,
    isActive: true,
    isSystem: true,
    isClosing: false,
    isFinal: false,
  };
}

const caseStatus = status("reviewing", "審核中", "Reviewing", "blue");
const matchStatus = status("proposed", "建議配對", "Proposed", "amber");
const taskStatus = status("open", "待跟進", "Open", "green");

/** The text of every status pill: the span after its dot. */
function pillLabels(markup: string): string[] {
  return [...markup.matchAll(/aria-hidden="true"><\/span><span>([^<]*)<\/span>/g)].map((m) => m[1]);
}

function task(id: string): CoordinatorTask {
  return {
    id,
    title: "Call the adopter",
    status: taskStatus,
    taskType: "follow_up",
    priority: "normal",
    dueAt: null,
    scheduledAt: null,
    completedAt: null,
    assignedTo: null,
    volunteer: null,
    contactChannel: null,
    outcome: null,
    nextStepAt: null,
    remarks: null,
    hasWindowNet: null,
    environment: null,
    score: null,
    createdAt: "2026-10-01T02:30:00Z",
    updatedAt: "2026-10-01T02:30:00Z",
    adoptionCase: null,
    adopterProfile: null,
    animal: null,
  };
}

/** The distinct pill labels: a table and its mobile card both draw the same status. */
function distinctPills(element: ReactElement) {
  return {
    zh: [...new Set(pillLabels(renderAdminInChinese(element)))],
    en: [...new Set(pillLabels(renderAdminInEnglish(element)))],
  };
}

describe("adoption status pills keep their wording", () => {
  test("AdopterDetail case history shows the case status", () => {
    const adopter = {
      id: "adopter-1",
      supporterId: null,
      displayName: "Chan",
      email: null,
      phone: null,
      livingArea: null,
      isBlacklisted: false,
      openCaseCount: 1,
      successfulAdoptionCount: 0,
      openTaskCount: 0,
      latestCaseAt: null,
      latestCase: null,
      nameEnglish: null,
      nameChinese: null,
      gender: null,
      birthday: null,
      occupation: null,
      facebook: null,
      householdSize: null,
      monthlyHouseholdIncome: null,
      address: null,
      floorArea: null,
      blacklistReason: null,
      emailConsent: null,
      whatsappConsent: null,
      cases: [
        {
          id: "case-1",
          applicantName: "Chan",
          animalType: "cat",
          status: caseStatus,
          requestedAnimalName: null,
          createdAt: "2026-10-01T02:30:00Z",
          closedAt: null,
        },
      ],
      successfulAdoptions: [],
      tasks: [],
    } satisfies AdopterDetailData;
    answers.clear();
    answers.set("adopter-profile", { adopter });
    answers.set("coordinator-statuses", { statuses: [] });
    const { zh, en } = distinctPills(<AdopterDetail adopterId="adopter-1" />);
    expect(zh).toEqual(["審核中"]);
    expect(en).toEqual(["Reviewing"]);
    // The table row and the mobile card each draw it.
    expect(pillLabels(renderAdminInChinese(<AdopterDetail adopterId="adopter-1" />))).toEqual([
      "審核中",
      "審核中",
    ]);
  });

  test("CaseDetail shows the current case status in both places it appears", () => {
    const adoptionCase = {
      id: "case-1",
      applicantName: "Chan",
      applicantPhone: "91234567",
      applicantEmail: null,
      animalType: "cat",
      requestedAnimalName: null,
      status: caseStatus,
      createdAt: "2026-10-01T02:30:00Z",
      closedAt: null,
      applicantAddress: null,
      housingType: null,
      familySize: null,
      existingPets: null,
      reason: null,
      supporterId: null,
      adopterProfileId: null,
      assessment: {},
      preferences: {},
      matches: [],
      followups: [],
      successfulAdoption: null,
      publicAdoption: null,
    } satisfies AdoptionCaseDetail;
    answers.clear();
    answers.set("adoption-case", { case: adoptionCase });
    answers.set("coordinator-statuses", { statuses: [] });
    const { zh, en } = distinctPills(<CaseDetail caseId="case-1" />);
    expect(zh).toEqual(["審核中"]);
    expect(en).toEqual(["Reviewing"]);
    expect(pillLabels(renderAdminInChinese(<CaseDetail caseId="case-1" />)).length).toBe(2);
  });

  test("MatchPanel shows each match's status", () => {
    answers.clear();
    const element = (
      <MatchPanel
        caseId="case-1"
        statuses={[matchStatus]}
        onChanged={() => {}}
        matches={[
          {
            id: "match-1",
            animalId: "animal-1",
            animalName: "Mochi",
            status: matchStatus,
            isApproved: false,
            notes: null,
          },
        ]}
      />
    );
    expect(pillLabels(renderAdminInChinese(element))).toEqual(["建議配對"]);
    expect(pillLabels(renderAdminInEnglish(element))).toEqual(["Proposed"]);
  });

  test("TaskPanel shows each task's status", () => {
    answers.clear();
    const element = (
      <TaskPanel
        title="Follow-ups"
        tasks={[task("task-1")]}
        statuses={[taskStatus]}
        onChanged={() => {}}
      />
    );
    const { zh, en } = distinctPills(element);
    expect(zh).toEqual(["待跟進"]);
    expect(en).toEqual(["Open"]);
  });

  test("IntakeInbox shows the urgency of each item and the resolved marker", () => {
    const item = (id: string, urgency: AdoptionIntakeItem["urgency"], resolvedAt: string | null) =>
      ({
        id,
        publicApplicationId: `pub-${id}`,
        adoptionCaseId: null,
        lane: "new_adoption_application",
        urgency,
        dueAt: "2026-10-02T02:30:00Z",
        createdAt: "2026-10-01T02:30:00Z",
        resolvedAt,
        summary: { applicantName: "Chan" },
      }) satisfies AdoptionIntakeItem;
    answers.clear();
    answers.set("adoption-intake-items", {
      items: [
        item("i1", "normal", null),
        item("i2", "high", null),
        item("i3", "overdue", "2026-10-03T02:30:00Z"),
      ],
      total: 3,
    });
    const zh = pillLabels(renderAdminInChinese(<IntakeInbox />));
    const en = pillLabels(renderAdminInEnglish(<IntakeInbox />));
    // normal, high, overdue, then the resolved marker on the third item.
    expect(zh).toEqual(["普通", "高", "逾期", "已處理"]);
    expect(en).toEqual(["Normal", "High", "Overdue", "Resolved"]);
  });

  test("AnimalPipeline shows each animal's lifecycle status", () => {
    const row = (id: string, animalStatus: AnimalPipelineRow["status"]) =>
      ({
        id,
        type: "cat",
        name: `Cat ${id}`,
        name_en: null,
        gender: "female",
        age: "2",
        status: animalStatus,
        image_url: null,
        created_at: null,
        updated_at: null,
        profile: {
          animal_id: id,
          internal_code: null,
          arrival_date: null,
          arrival_source_id: null,
          current_position_id: null,
          cage: null,
          has_chip: null,
          chip_remarks: null,
          is_desexed: null,
          desexed_at: null,
          desex_remarks: null,
          is_adoptable: true,
          is_inside_support_pool: true,
          adopted_at: null,
          deceased_at: null,
          internal_remarks: null,
        },
        currentPosition: null,
        arrivalSource: null,
      }) satisfies AnimalPipelineRow;
    answers.clear();
    answers.set("coordinator-animal-pipeline", {
      animals: [row("a1", "available"), row("a2", "fostered"), row("a3", "adopted")],
      total: 3,
      page: 1,
      pageSize: 25,
    });
    answers.set("animal-positions", []);
    answers.set("arrival-sources", []);
    answers.set("coordinator-statuses", []);
    answers.set("coordinator-animal-tasks", []);
    // The Chinese pipeline screen has always shown the lifecycle names in English.
    const { zh, en } = distinctPills(<AnimalPipeline />);
    expect(en).toEqual(["Available", "Fostered", "Adopted"]);
    expect(zh).toEqual(["Available", "Fostered", "Adopted"]);
  });
});
