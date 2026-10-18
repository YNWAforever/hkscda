import {
  normalizeAttendancePreviewCommand,
  parseRosterAttendanceReply,
  type AttendanceCommand,
  type AttendancePreviewCommand,
  type RosterAttendanceOperation,
} from "./attendance";
import { z } from "zod";
export type AttendanceOperationPointer = {
  actorUserId: string;
  previewKey: string | null;
  operationId: string | null;
  phase: "previewing" | "applying" | "outcome_unknown" | "completed";
};
export type AttendanceRecoveryProblem =
  | "invalid_input"
  | "transport"
  | "status_unavailable"
  | "pointer_unavailable"
  | "pointer_unavailable_retry"
  | "idempotency_mismatch"
  | "refresh_failed"
  | null;
export type AttendanceRecoveryState = {
  phase:
    | "draft"
    | "previewing"
    | "previewed"
    | "applying"
    | "outcome_unknown"
    | "results"
    | "saved_refresh_failed";
  actorUserId: string;
  previewKey: string | null;
  operationId: string | null;
  previewCommand: AttendancePreviewCommand | null;
  operation: RosterAttendanceOperation | null;
  applyIntent: boolean;
  problem: AttendanceRecoveryProblem;
};
export type AttendanceRecoveryEvent = {
  type:
    | "PREVIEW_REQUESTED"
    | "PREVIEW_RECEIVED"
    | "PREVIEW_REJECTED"
    | "PREVIEW_LOST"
    | "LOOKUP_RECEIVED"
    | "APPLY_CONFIRMED"
    | "APPLY_RECEIVED"
    | "APPLY_LOST"
    | "STATUS_RECEIVED"
    | "STATUS_FAILED"
    | "REFRESH_FAILED"
    | "REFRESH_SUCCEEDED"
    | "CANCEL_PREVIEW"
    | "IDENTITY_CLEARED";
  actorUserId: string;
  requestKey?: string;
  operationId?: string;
  command?: AttendancePreviewCommand;
  operation?: RosterAttendanceOperation;
  problem?: AttendanceRecoveryProblem;
  priorApplyIntent?: boolean;
};
export function initialAttendanceRecoveryState(actorUserId = ""): AttendanceRecoveryState {
  return {
    phase: "draft",
    actorUserId,
    previewKey: null,
    operationId: null,
    previewCommand: null,
    operation: null,
    applyIntent: false,
    problem: null,
  };
}
export function reduceAttendanceRecovery(
  state: AttendanceRecoveryState,
  event: AttendanceRecoveryEvent,
): AttendanceRecoveryState {
  if (event.type === "IDENTITY_CLEARED") return initialAttendanceRecoveryState(event.actorUserId);
  if (state.actorUserId && event.actorUserId !== state.actorUserId) return state;
  if (event.type === "PREVIEW_REQUESTED" && event.command) {
    if (
      ["previewing", "applying", "outcome_unknown"].includes(state.phase) ||
      (state.applyIntent &&
        state.operation?.state !== "completed" &&
        state.operation?.state !== "expired")
    )
      return state;
    return {
      ...initialAttendanceRecoveryState(event.actorUserId),
      phase: "previewing",
      previewKey: event.command.idempotency_key,
      previewCommand: event.command,
    };
  }
  if (event.actorUserId !== state.actorUserId) return state;
  if (event.requestKey && state.previewKey && event.requestKey !== state.previewKey) return state;
  if (event.operationId && state.operationId && event.operationId !== state.operationId)
    return state;
  if (event.type === "CANCEL_PREVIEW") {
    if (
      state.phase === "applying" ||
      (state.applyIntent &&
        state.operation?.state !== "completed" &&
        state.operation?.state !== "expired")
    )
      return state;
    return initialAttendanceRecoveryState(state.actorUserId);
  }
  if (
    ["PREVIEW_RECEIVED", "LOOKUP_RECEIVED", "APPLY_RECEIVED", "STATUS_RECEIVED"].includes(
      event.type,
    ) &&
    event.operation
  ) {
    const op = event.operation;
    return {
      ...state,
      operation: op,
      operationId: op.id,
      phase: op.state === "completed" ? "results" : "previewed",
      problem: state.problem === "idempotency_mismatch" ? "idempotency_mismatch" : null,
    };
  }
  if (event.type === "PREVIEW_REJECTED")
    return { ...state, phase: "draft", problem: event.problem ?? "invalid_input" };
  if (event.type === "APPLY_CONFIRMED")
    return { ...state, phase: "applying", applyIntent: true, problem: null };
  if (event.type === "PREVIEW_LOST" || event.type === "APPLY_LOST") {
    if (event.problem === "pointer_unavailable") {
      const uncertain = event.priorApplyIntent ?? state.applyIntent;
      return {
        ...state,
        phase: uncertain ? "outcome_unknown" : "previewed",
        applyIntent: uncertain,
        problem: uncertain ? "pointer_unavailable_retry" : event.problem,
      };
    }
    return { ...state, phase: "outcome_unknown", problem: event.problem ?? "transport" };
  }
  if (event.type === "STATUS_FAILED")
    return {
      ...state,
      phase: "outcome_unknown",
      problem:
        state.problem === "idempotency_mismatch" ? "idempotency_mismatch" : "status_unavailable",
    };
  if (event.type === "REFRESH_FAILED")
    return { ...state, phase: "saved_refresh_failed", problem: "refresh_failed" };
  if (event.type === "REFRESH_SUCCEEDED") return { ...state, phase: "results", problem: null };
  return state;
}
type Dependencies = {
  send: (command: AttendanceCommand, expectedActorUserId: string) => Promise<unknown>;
  savePointer: (pointer: AttendanceOperationPointer) => Promise<"session" | "url" | "memory">;
  readPointer: (actorUserId: string) => AttendanceOperationPointer | null;
  invalidate: () => Promise<void>;
  onState: (state: AttendanceRecoveryState) => void;
};
function statusOf(error: unknown): number | null {
  return typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
    ? error.status
    : null;
}
export function attendancePointerKey(actorUserId: string): string {
  return "hkscda.admin.list.query.attendance.operation." + actorUserId;
}
export function readAttendanceOperationPointer(
  storage: Pick<Storage, "getItem">,
  actorUserId: string,
): AttendanceOperationPointer | null {
  try {
    const pointer = z
      .object({
        actorUserId: z.string().uuid(),
        previewKey: z.string().uuid().nullable(),
        operationId: z.string().uuid().nullable(),
        phase: z.enum(["previewing", "applying", "outcome_unknown", "completed"]),
      })
      .strict()
      .safeParse(JSON.parse(storage.getItem(attendancePointerKey(actorUserId)) ?? "null"));
    return pointer.success &&
      pointer.data.actorUserId === actorUserId &&
      (pointer.data.operationId || pointer.data.previewKey)
      ? pointer.data
      : null;
  } catch {
    return null;
  }
}
export function createAttendanceController(deps: Dependencies) {
  let state = initialAttendanceRecoveryState();
  let generation = 0,
    reading = false;
  const emit = (event: AttendanceRecoveryEvent) => {
    state = reduceAttendanceRecovery(state, event);
    deps.onState(state);
  };
  const current = (ticket: number, actor: string) =>
    ticket === generation && state.actorUserId === actor;
  const refresh = async (ticket: number, actor: string) => {
    if (current(ticket, actor) && state.operation?.state === "completed") {
      try {
        await deps.savePointer({
          actorUserId: actor,
          previewKey: state.previewKey,
          operationId: state.operation.id,
          phase: "completed",
        });
      } catch {
        /* A known receipt remains readable when optional storage fails. */
      }
      if (!current(ticket, actor)) return;
    }
    try {
      await deps.invalidate();
      if (current(ticket, actor))
        emit({
          type: "REFRESH_SUCCEEDED",
          actorUserId: actor,
          operationId: state.operationId ?? undefined,
        });
    } catch {
      if (current(ticket, actor))
        emit({
          type: "REFRESH_FAILED",
          actorUserId: actor,
          operationId: state.operationId ?? undefined,
        });
    }
  };
  async function recover(expectedActorUserId?: string) {
    if (expectedActorUserId && expectedActorUserId !== state.actorUserId) return;
    if (reading || !state.actorUserId || (!state.operationId && !state.previewKey)) return;
    reading = true;
    const actor = state.actorUserId,
      ticket = generation,
      id = state.operationId,
      key = state.previewKey;
    try {
      const raw = await deps.send(
        id
          ? { action: "status", operation_id: id }
          : { action: "attendance_lookup", idempotency_key: key! },
        actor,
      );
      const operation = parseRosterAttendanceReply(raw);
      if (id && operation.id !== id) throw new Error("Original operation identity differs");
      if (!current(ticket, actor)) return;
      emit({
        type: id ? "STATUS_RECEIVED" : "LOOKUP_RECEIVED",
        actorUserId: actor,
        requestKey: key ?? undefined,
        operationId: id ?? undefined,
        operation,
      });
      if (operation.state === "completed") await refresh(ticket, actor);
    } catch {
      if (current(ticket, actor))
        emit({
          type: "STATUS_FAILED",
          actorUserId: actor,
          operationId: id ?? undefined,
          requestKey: key ?? undefined,
        });
    } finally {
      if (current(ticket, actor)) reading = false;
    }
  }
  return {
    getState: () => state,
    async preview(raw: AttendancePreviewCommand, actorUserId: string) {
      if (state.actorUserId && state.actorUserId !== actorUserId) return;
      if (
        ["previewing", "applying", "outcome_unknown"].includes(state.phase) ||
        (state.applyIntent &&
          state.operation?.state !== "completed" &&
          state.operation?.state !== "expired")
      )
        return;
      let command: AttendancePreviewCommand;
      try {
        command = normalizeAttendancePreviewCommand(raw);
      } catch {
        if (!state.actorUserId) state = initialAttendanceRecoveryState(actorUserId);
        emit({ type: "PREVIEW_REJECTED", actorUserId, problem: "invalid_input" });
        return;
      }
      const ticket = ++generation;
      emit({ type: "PREVIEW_REQUESTED", actorUserId, command });
      try {
        try {
          await deps.savePointer({
            actorUserId,
            previewKey: command.idempotency_key,
            operationId: null,
            phase: "previewing",
          });
        } catch {
          /* No business writes in preview. */
        }
        if (!current(ticket, actorUserId)) return;
        const operation = parseRosterAttendanceReply(await deps.send(command, actorUserId));
        if (
          operation.activity_id !== command.activity_id ||
          operation.scope.page !== command.page ||
          operation.rows.length !== command.entries.length ||
          operation.rows.some(
            (row, index) =>
              row.target.registration_id !== command.entries[index]?.registration_id ||
              row.target.expected_updated_at !== command.entries[index]?.expected_updated_at ||
              row.target.attendance_status !== command.entries[index]?.attendance_status ||
              row.target.command !== command.entries[index]?.command ||
              row.target.reason !== command.entries[index]?.reason,
          )
        )
          throw new Error("Preview differs from requested identities");
        if (!current(ticket, actorUserId)) return;
        emit({
          type: "PREVIEW_RECEIVED",
          actorUserId,
          requestKey: command.idempotency_key,
          operation,
        });
      } catch (error) {
        if (!current(ticket, actorUserId)) return;
        const status = statusOf(error);
        if (status === 400 || status === 422) {
          emit({ type: "PREVIEW_REJECTED", actorUserId, problem: "invalid_input" });
          return;
        }
        emit({
          type: "PREVIEW_LOST",
          actorUserId,
          problem: status === 409 ? "idempotency_mismatch" : "transport",
        });
        await recover();
      }
    },
    async apply(expectedActorUserId: string, expectedOperationId: string) {
      if (expectedActorUserId !== state.actorUserId || expectedOperationId !== state.operationId)
        return;
      const operation = state.operation;
      if (
        state.phase !== "previewed" ||
        operation?.state !== "previewed" ||
        state.problem === "idempotency_mismatch"
      )
        return;
      const priorApplyIntent = state.applyIntent;
      const actor = state.actorUserId,
        ticket = generation,
        id = operation.id;
      emit({ type: "APPLY_CONFIRMED", actorUserId: actor, operationId: id });
      try {
        const mode = await deps.savePointer({
          actorUserId: actor,
          previewKey: state.previewKey,
          operationId: id,
          phase: "applying",
        });
        if (mode === "memory") throw new Error("No durable recovery pointer");
      } catch {
        if (current(ticket, actor))
          emit({
            type: "APPLY_LOST",
            actorUserId: actor,
            operationId: id,
            problem: "pointer_unavailable",
            priorApplyIntent,
          });
        return;
      }
      if (!current(ticket, actor)) return;
      try {
        const result = parseRosterAttendanceReply(
          await deps.send({ action: "attendance_apply", operation_id: id }, actor),
        );
        if (result.id !== id || result.state !== "completed")
          throw new Error("No complete original receipt");
        if (!current(ticket, actor)) return;
        emit({ type: "APPLY_RECEIVED", actorUserId: actor, operationId: id, operation: result });
        await refresh(ticket, actor);
      } catch {
        if (!current(ticket, actor)) return;
        emit({ type: "APPLY_LOST", actorUserId: actor, operationId: id });
        await recover();
      }
    },
    recover,
    async retryRefresh() {
      if (state.operation?.state === "completed") await refresh(generation, state.actorUserId);
    },
    cancelPreview(expectedActorUserId?: string) {
      if (expectedActorUserId && expectedActorUserId !== state.actorUserId) return;
      const previous = state;
      emit({ type: "CANCEL_PREVIEW", actorUserId: state.actorUserId });
      if (state !== previous) {
        generation++;
        reading = false;
      }
    },
    clearIdentity(actorUserId = "") {
      generation++;
      reading = false;
      emit({ type: "IDENTITY_CLEARED", actorUserId });
    },
    beginRestore(actorUserId: string, operationId: string, applyIntent = false) {
      if (!z.string().uuid().safeParse(operationId).success) return;
      if (state.actorUserId && state.actorUserId !== actorUserId) return;
      if (state.operationId === operationId) return;
      if (
        state.applyIntent &&
        state.operation?.state !== "completed" &&
        state.operation?.state !== "expired"
      )
        return;
      let pointer: AttendanceOperationPointer | null = null;
      try {
        pointer = deps.readPointer(actorUserId);
      } catch {
        /* Optional storage. */
      }
      const pending =
        pointer?.actorUserId === actorUserId &&
        (pointer.phase === "applying" || pointer.phase === "outcome_unknown") &&
        pointer.operationId
          ? pointer
          : null;
      const originalId = pending?.operationId ?? operationId;
      const matching =
        pointer?.actorUserId === actorUserId && pointer.operationId === originalId ? pointer : null;
      generation++;
      reading = false;
      state = {
        ...initialAttendanceRecoveryState(actorUserId),
        phase: "outcome_unknown",
        operationId: originalId,
        previewKey: matching?.previewKey ?? null,
        applyIntent: Boolean(pending || applyIntent || matching?.phase === "completed"),
      };
      deps.onState(state);
    },
    async hydrate(operation: RosterAttendanceOperation, actorUserId: string, applyIntent = false) {
      if (
        (state.actorUserId && state.actorUserId !== actorUserId) ||
        (state.operationId && state.operationId !== operation.id)
      )
        return;
      if (state.phase === "saved_refresh_failed" && state.operationId === operation.id) return;
      if (
        state.applyIntent &&
        ["applying", "outcome_unknown"].includes(state.phase) &&
        state.operation !== null &&
        operation.state !== "completed"
      )
        return;
      const alreadyKnown =
        state.operationId === operation.id && state.operation?.state === "completed";
      if (!state.actorUserId) state = initialAttendanceRecoveryState(actorUserId);
      state = { ...state, applyIntent: state.applyIntent || applyIntent };
      emit({ type: "STATUS_RECEIVED", actorUserId, operationId: operation.id, operation });
      if (operation.state === "completed" && !alreadyKnown) await refresh(generation, actorUserId);
    },
    async restore(actorUserId: string) {
      if (state.actorUserId && state.actorUserId !== actorUserId) return;
      if (state.operationId || state.phase !== "draft") return;
      const pointer = deps.readPointer(actorUserId);
      if (!pointer || pointer.actorUserId !== actorUserId) return;
      generation++;
      state = {
        ...initialAttendanceRecoveryState(actorUserId),
        phase: "outcome_unknown",
        previewKey: pointer.previewKey,
        operationId: pointer.operationId,
        applyIntent: pointer.phase !== "previewing",
      };
      deps.onState(state);
      await recover();
    },
  };
}
export type AttendanceController = ReturnType<typeof createAttendanceController>;
