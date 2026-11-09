import { describe, expect, test } from "bun:test";
import {
  assertActivityStatusTransition,
  VolunteerActivityTransitionError,
} from "./activityTransition";

describe("OPS-01: assertActivityStatusTransition", () => {
  test("refuses cancelled → published with activity_closed", () => {
    expect(() => assertActivityStatusTransition("cancelled", "published")).toThrow(
      VolunteerActivityTransitionError,
    );
    try {
      assertActivityStatusTransition("cancelled", "published");
    } catch (error) {
      expect(error).toBeInstanceOf(VolunteerActivityTransitionError);
      expect((error as VolunteerActivityTransitionError).code).toBe("activity_closed");
    }
  });

  test("refuses closed → published with activity_closed", () => {
    expect(() => assertActivityStatusTransition("closed", "published")).toThrow(
      VolunteerActivityTransitionError,
    );
    try {
      assertActivityStatusTransition("closed", "published");
    } catch (error) {
      expect(error).toBeInstanceOf(VolunteerActivityTransitionError);
      expect((error as VolunteerActivityTransitionError).code).toBe("activity_closed");
    }
  });

  test("still allows cancelled → closed and draft/published transitions", () => {
    expect(() => assertActivityStatusTransition("cancelled", "closed")).not.toThrow();
    expect(() => assertActivityStatusTransition("draft", "published")).not.toThrow();
    expect(() => assertActivityStatusTransition("published", "closed")).not.toThrow();
    expect(() => assertActivityStatusTransition("draft", undefined)).not.toThrow();
  });
});
