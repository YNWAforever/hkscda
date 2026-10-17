import { useCallback, useEffect } from "react";
import { z } from "zod";
const positionSchema = z.object({
  listKey: z.enum(["volunteer-tasks", "volunteer-workspace"]),
  actorUserId: z.string().uuid(),
  scopeKey: z.string().max(500),
  recordId: z.string().min(1).max(200),
  scrollY: z.number().finite().nonnegative().max(100000000),
});
type Position = z.infer<typeof positionSchema>;
type PositionStore = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem?: (key: string) => void;
};
const key = (listKey: string, actor: string) =>
  `hkscda.admin.list.query.return.${actor}.${listKey}`;
const memory = new Map<string, Position>();
export function saveVolunteerReturnPosition(
  storage: Pick<PositionStore, "setItem">,
  position: Position,
): void {
  const value = positionSchema.parse(position);
  storage.setItem(key(value.listKey, value.actorUserId), JSON.stringify(value));
}
export function readVolunteerReturnPosition(
  storage: Pick<PositionStore, "getItem">,
  listKey: string,
  actorUserId: string,
  scopeKey: string,
): Position | null {
  try {
    const parsed = positionSchema.safeParse(
      JSON.parse(storage.getItem(key(listKey, actorUserId)) ?? "null"),
    );
    return parsed.success &&
      parsed.data.actorUserId === actorUserId &&
      parsed.data.listKey === listKey &&
      parsed.data.scopeKey === scopeKey
      ? parsed.data
      : null;
  } catch {
    return null;
  }
}
export function useVolunteerReturnPosition(options: {
  listKey: Position["listKey"];
  actorUserId: string;
  scopeKey: string;
  ready: boolean;
}): { remember: (recordId: string) => void; restore: () => void; clear: () => void } {
  const { listKey, actorUserId, scopeKey, ready } = options;
  const storageKey = key(listKey, actorUserId);
  const clear = useCallback(() => {
    memory.delete(storageKey);
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      /* Optional storage. */
    }
  }, [storageKey]);
  const remember = useCallback(
    (recordId: string) => {
      if (!actorUserId) return;
      const dialog =
        listKey === "volunteer-workspace"
          ? document.querySelector<HTMLElement>('[role="dialog"]')
          : null;
      const value: Position = {
        listKey,
        actorUserId,
        scopeKey,
        recordId,
        scrollY: dialog?.scrollTop ?? window.scrollY,
      };
      if (!positionSchema.safeParse(value).success) return;
      memory.set(storageKey, value);
      while (memory.size > 20) memory.delete(memory.keys().next().value!);
      try {
        saveVolunteerReturnPosition(window.sessionStorage, value);
      } catch {
        /* Memory survives SPA navigation. */
      }
    },
    [actorUserId, listKey, scopeKey, storageKey],
  );
  const restore = useCallback(() => {
    if (!ready || !actorUserId) return;
    let value: Position | null = null;
    try {
      value = readVolunteerReturnPosition(window.sessionStorage, listKey, actorUserId, scopeKey);
    } catch {
      /* Optional storage. */
    }
    value ??= memory.get(storageKey)?.scopeKey === scopeKey ? memory.get(storageKey)! : null;
    if (!value) return;
    clear();
    const dialog =
      listKey === "volunteer-workspace"
        ? document.querySelector<HTMLElement>('[role="dialog"]')
        : null;
    if (dialog)
      dialog.scrollTop = Math.min(
        value.scrollY,
        Math.max(0, dialog.scrollHeight - dialog.clientHeight),
      );
    else
      window.scrollTo(
        0,
        Math.min(
          value.scrollY,
          Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
        ),
      );
    const element =
      document.getElementById(value.recordId) ??
      document.getElementById(
        listKey === "volunteer-tasks" ? "tasks-pending" : "activity-roster-heading",
      );
    element?.focus({ preventScroll: true });
  }, [actorUserId, clear, listKey, ready, scopeKey, storageKey]);
  useEffect(() => {
    if (!ready) return;
    const frame = window.requestAnimationFrame(restore);
    return () => window.cancelAnimationFrame(frame);
  }, [ready, restore]);
  useEffect(() => {
    const reset = () => {
      memory.clear();
      clear();
    };
    window.addEventListener("hkscda-admin-identity-cleared", reset);
    return () => window.removeEventListener("hkscda-admin-identity-cleared", reset);
  }, [clear]);
  return { remember, restore, clear };
}
