import { expect, test } from "bun:test";
import { createAttendanceController } from "./attendanceRecovery";
import type { AttendanceOperationPointer } from "./attendanceRecovery";
import type {
  AttendanceCommand,
  AttendancePreviewCommand,
  RosterAttendanceOperation,
} from "./attendance";
const actor = "90000000-0000-4000-8000-000000000001",
  opId = "90000000-0000-4000-8000-000000000002",
  id = "90000000-0000-4000-8000-000000000003";
const stamp = "2026-10-16T00:00:00.123456Z";
function preview(): RosterAttendanceOperation {
  return {
    id: opId,
    action: "roster_attendance",
    created_at: stamp,
    expires_at: "2026-10-16T00:30:00Z",
    activity_id: id,
    activity_title: "Synthetic",
    scope: { kind: "page", page: 1, page_size: 25, selected_count: 1 },
    state: "previewed",
    rows: [
      {
        registration_id: id,
        contact_name: "Synthetic",
        participant_count: 1,
        before: {
          registration_status: "approved",
          attendance_status: "not_marked",
          updated_at: stamp,
        },
        target: {
          registration_id: id,
          expected_updated_at: stamp,
          attendance_status: "attended",
          command: "record",
        },
        decision: "ready",
        reason: null,
      },
    ],
    results: null,
    notifications: [],
  };
}
function command(): AttendancePreviewCommand {
  return {
    action: "attendance_preview",
    activity_id: id,
    expected_activity_updated_at: stamp,
    page: 1,
    page_size: 25,
    entries: [preview().rows[0].target],
    idempotency_key: actor,
  };
}
function reply(completed = false) {
  const operation = preview();
  if (completed) {
    operation.state = "completed";
    operation.results = [
      {
        registration_id: id,
        kind: "applied",
        reason: null,
        before: operation.rows[0].before,
        current: operation.rows[0].before,
        after: {
          registration_status: "approved",
          attendance_status: "attended",
          updated_at: "2026-10-16T00:00:00.123457Z",
        },
        event_id: id,
        audit_id: opId,
      },
    ];
  }
  return { kind: "ready", operation };
}
function setup(
  send: (command: AttendanceCommand, actor: string) => Promise<unknown>,
  invalidate: () => Promise<void> = async () => {},
) {
  return createAttendanceController({
    send,
    invalidate,
    savePointer: async () => "session",
    readPointer: () => null,
    onState: () => {},
  });
}
test("double confirm dispatches one write and cancel preview never applies", async () => {
  const calls: AttendanceCommand[] = [];
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  const controller = setup(async (command, who) => {
    expect(who).toBe(actor);
    calls.push(command);
    if (command.action === "attendance_apply") {
      await pending;
      return reply(true);
    }
    return reply();
  });
  await controller.preview(command(), actor);
  controller.cancelPreview();
  expect(controller.getState().phase).toBe("draft");
  expect(calls.filter((c) => c.action === "attendance_apply")).toHaveLength(0);
  await controller.preview({ ...command(), idempotency_key: opId }, actor);
  const first = controller.apply(actor, opId),
    duplicate = controller.apply(actor, opId);
  release();
  await Promise.all([first, duplicate]);
  expect(calls.filter((c) => c.action === "attendance_apply")).toHaveLength(1);
  expect(controller.getState().phase).toBe("results");
});
test("lost apply response reconciles the original ID without a blind resend", async () => {
  const calls: AttendanceCommand[] = [];
  const controller = setup(async (command) => {
    calls.push(command);
    if (command.action === "attendance_preview") return reply();
    if (command.action === "attendance_apply") throw new Error("response lost");
    return reply(true);
  });
  await controller.preview(command(), actor);
  await controller.apply(actor, opId);
  expect(calls.map((c) => c.action)).toEqual(["attendance_preview", "attendance_apply", "status"]);
  expect(calls[2]).toEqual({ action: "status", operation_id: opId });
  expect(controller.getState().phase).toBe("results");
  expect(controller.getState().operation?.results?.[0].kind).toBe("applied");
});
test("failed pointer persistence on an explicit retry preserves the earlier uncertain write", async () => {
  const calls: AttendanceCommand[] = [];
  let pointerAvailable = true;
  const controller = createAttendanceController({
    send: async (input) => {
      calls.push(input);
      if (input.action === "attendance_apply") throw new Error("original response lost");
      return reply();
    },
    savePointer: async () => (pointerAvailable ? "session" : "memory"),
    readPointer: () => null,
    invalidate: async () => {},
    onState: () => {},
  });
  await controller.preview(command(), actor);
  await controller.apply(actor, opId);
  expect(controller.getState()).toMatchObject({
    phase: "previewed",
    applyIntent: true,
    operationId: opId,
  });
  pointerAvailable = false;
  await controller.apply(actor, opId);
  expect(controller.getState().applyIntent).toBe(true);
  expect(controller.getState().phase).toBe("outcome_unknown");
  controller.cancelPreview(actor);
  await controller.preview({ ...command(), idempotency_key: id }, actor);
  expect(controller.getState().operationId).toBe(opId);
  expect(calls.filter((c) => c.action === "attendance_apply")).toHaveLength(1);
  expect(calls.filter((c) => c.action === "attendance_preview")).toHaveLength(1);
});
test("a different URL cannot replace the actor's unresolved persisted operation", async () => {
  const calls: AttendanceCommand[] = [];
  const controller = createAttendanceController({
    send: async (input) => {
      calls.push(input);
      return reply();
    },
    savePointer: async () => "session",
    readPointer: () => ({
      actorUserId: actor,
      previewKey: actor,
      operationId: opId,
      phase: "applying",
    }),
    invalidate: async () => {},
    onState: () => {},
  });
  controller.beginRestore(actor, id, false);
  expect(controller.getState()).toMatchObject({
    operationId: opId,
    applyIntent: true,
    phase: "outcome_unknown",
  });
  controller.cancelPreview(actor);
  await controller.preview(command(), actor);
  expect(calls).toHaveLength(0);
  expect(controller.getState().operationId).toBe(opId);
});
test("a persisted terminal receipt does not redirect another URL to a previously completed operation", async () => {
  let pointer: AttendanceOperationPointer | null = null;
  const deps = {
    send: async (input: AttendanceCommand) => reply(input.action === "attendance_apply"),
    savePointer: async (value: AttendanceOperationPointer) => {
      pointer = value;
      return "session" as const;
    },
    readPointer: () => pointer,
    invalidate: async () => {},
    onState: () => {},
  };
  const first = createAttendanceController(deps);
  await first.preview(command(), actor);
  await first.apply(actor, opId);
  const next = createAttendanceController(deps);
  next.beginRestore(actor, id, false);
  expect(next.getState().operationId).toBe(id);
  expect(next.getState().phase).toBe("outcome_unknown");
});
test("unknown status blocks new preview, cancel and apply until the original status is known", async () => {
  const calls: AttendanceCommand[] = [];
  let statusFails = true;
  const controller = setup(async (command) => {
    calls.push(command);
    if (command.action === "attendance_preview") return reply();
    if (command.action === "attendance_apply") throw new Error("lost");
    if (statusFails) throw new Error("offline");
    return reply();
  });
  await controller.preview(command(), actor);
  await controller.apply(actor, opId);
  expect(controller.getState().phase).toBe("outcome_unknown");
  const count = calls.length;
  controller.cancelPreview();
  await controller.preview({ ...command(), idempotency_key: id }, actor);
  await controller.apply(actor, opId);
  expect(calls).toHaveLength(count);
  statusFails = false;
  await controller.recover();
  expect(controller.getState().phase).toBe("previewed");
  expect(controller.getState().operation?.id).toBe(opId);
  expect(calls.filter((c) => c.action === "attendance_preview")).toHaveLength(1);
});
test("known saved receipt survives a refresh error and retry refresh never writes", async () => {
  let fail = true;
  const calls: AttendanceCommand[] = [];
  const controller = setup(
    async (command) => {
      calls.push(command);
      return reply(command.action === "attendance_apply");
    },
    async () => {
      if (fail) throw new Error("reload failed");
    },
  );
  await controller.preview(command(), actor);
  await controller.apply(actor, opId);
  expect(controller.getState().phase).toBe("saved_refresh_failed");
  expect(controller.getState().operation?.results?.[0].kind).toBe("applied");
  fail = false;
  await controller.retryRefresh();
  expect(controller.getState().phase).toBe("results");
  expect(calls.filter((c) => c.action === "attendance_apply")).toHaveLength(1);
});
test("lost preview uses its original request key and malformed success stays unknown", async () => {
  const calls: AttendanceCommand[] = [];
  const controller = setup(async (command) => {
    calls.push(command);
    if (command.action === "attendance_preview") throw new Error("lost preview");
    if (command.action === "attendance_lookup") return reply();
    return { kind: "ready", operation: { ...preview(), state: "completed", results: [] } };
  });
  await controller.preview(command(), actor);
  expect(calls[1]).toEqual({ action: "attendance_lookup", idempotency_key: actor });
  await controller.apply(actor, opId);
  expect(controller.getState().phase).toBe("outcome_unknown");
  expect(calls.filter((c) => c.action === "attendance_apply")).toHaveLength(1);
});
test("a changed identity fences late responses and cannot submit the previous actor's draft", async () => {
  let release!: (value: unknown) => void;
  let sent!: () => void;
  const started = new Promise<void>((resolve) => {
    sent = resolve;
  });
  const response = new Promise((resolve) => {
    release = resolve;
  });
  const calls: AttendanceCommand[] = [];
  const controller = setup(async (command) => {
    calls.push(command);
    sent();
    return response;
  });
  const pending = controller.preview(command(), actor);
  await started;
  controller.clearIdentity(id);
  release(reply());
  await pending;
  await controller.apply(actor, opId);
  expect(controller.getState().actorUserId).toBe(id);
  expect(controller.getState().operation).toBeNull();
  expect(calls.some((c) => c.action === "attendance_apply")).toBe(false);
});
test("a write cannot start when its recovery pointer cannot persist", async () => {
  const calls: AttendanceCommand[] = [];
  const controller = createAttendanceController({
    send: async (c) => {
      calls.push(c);
      return reply();
    },
    savePointer: async () => "memory",
    readPointer: () => null,
    invalidate: async () => {},
    onState: () => {},
  });
  await controller.preview(command(), actor);
  await controller.apply(actor, opId);
  expect(calls.filter((c) => c.action === "attendance_apply")).toHaveLength(0);
  expect(controller.getState().problem).toBe("pointer_unavailable");
});
test("invalid local selection stays an editable draft without an unhandled rejection or network request", async () => {
  let calls = 0;
  const controller = setup(async () => {
    calls++;
    return reply();
  });
  await controller.preview({ ...command(), entries: [] }, actor);
  expect(controller.getState().phase).toBe("draft");
  expect(controller.getState().problem).toBe("invalid_input");
  expect(calls).toBe(0);
});
test("a stale UI confirmation cannot apply the new actor's current operation", async () => {
  const calls: AttendanceCommand[] = [];
  const controller = setup(async (command) => {
    calls.push(command);
    return reply(command.action === "attendance_apply");
  });
  controller.clearIdentity(id);
  await controller.preview(command(), id);
  await controller.apply(actor, opId);
  expect(calls.filter((c) => c.action === "attendance_apply")).toHaveLength(0);
  expect(controller.getState().actorUserId).toBe(id);
});
test("a stale preview callback cannot replace the new actor's editable draft", async () => {
  let calls = 0;
  const controller = setup(async () => {
    calls++;
    return reply();
  });
  controller.clearIdentity(id);
  await controller.preview(command(), actor);
  expect(calls).toBe(0);
  expect(controller.getState().actorUserId).toBe(id);
});
test("restoring a completed receipt refreshes views that may have read before the write committed", async () => {
  let refreshes = 0;
  const controller = setup(
    async () => reply(true),
    async () => {
      refreshes++;
    },
  );
  await controller.hydrate(reply(true).operation, actor);
  expect(refreshes).toBe(1);
  expect(controller.getState().phase).toBe("results");
});
