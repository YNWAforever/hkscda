import { describe, expect, test } from "bun:test";

import {
  buildCoordinatorAdopterCsv,
  buildCoordinatorCaseCsv,
  buildCoordinatorTaskCsv,
} from "./csv";

describe("coordinator csv builders", () => {
  test("builds formula-safe adopter CSV rows", () => {
    const csv = buildCoordinatorAdopterCsv([
      {
        adopterProfileId: "profile-1",
        supporterId: "supporter-1",
        displayName: "=Ada",
        email: "ada@example.test",
        phone: "+85261234567",
        livingArea: "Kowloon",
        isBlacklisted: true,
        openCaseCount: 2,
        successfulAdoptionCount: 1,
        openTaskCount: 3,
        latestCaseAt: "2026-06-27T08:00:00.000Z",
      },
    ]);

    expect(csv.split("\n")[0]).toBe(
      "adopter_profile_id,supporter_id,display_name,email,phone,living_area,is_blacklisted,open_case_count,successful_adoption_count,open_task_count,latest_case_at",
    );
    expect(csv).toContain("'=Ada");
  });

  test("builds case and task CSVs with HKD cents formatted as dollars", () => {
    expect(
      buildCoordinatorCaseCsv([
        {
          caseId: "case-1",
          applicantName: "Ada",
          applicantPhone: "1234",
          applicantEmail: "ada@example.test",
          status: "Screening",
          animalType: "cat",
          requestedAnimal: "Mochi",
          adopterProfileId: "profile-1",
          supporterId: "supporter-1",
          createdAt: "2026-06-27T08:00:00.000Z",
          closedAt: null,
        },
      ]),
    ).toContain("case-1,Ada,1234");

    expect(
      buildCoordinatorTaskCsv([
        {
          taskId: "task-1",
          title: "Follow up",
          status: "Open",
          priority: "urgent",
          dueAt: "2026-06-28T00:30:00.000Z",
          completedAt: null,
          adoptionCaseId: "case-1",
          adopterProfileId: "profile-1",
          animalId: "animal-1",
          assignedTo: "Ada",
          volunteer: null,
          contactChannel: "whatsapp",
          outcome: null,
          remarks: "Call",
        },
      ]),
    ).toContain("task-1,Follow up,Open,urgent");
  });
});
