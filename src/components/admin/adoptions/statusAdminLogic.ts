import type { CoordinatorStatus, CoordinatorStatusCategory } from "../../../lib/adoptions/types";

export type StatusFormState = {
  id: string | null;
  category: CoordinatorStatusCategory;
  key: string;
  labelZh: string;
  labelEn: string;
  sortOrder: string;
  color: string;
  isActive: boolean;
  isSystem: boolean;
  isClosing: boolean;
  isFinal: boolean;
};

export type StatusMutationPayload = {
  category?: CoordinatorStatusCategory;
  key?: string;
  labelZh?: string;
  labelEn?: string;
  sortOrder?: number;
  color?: string;
  isActive?: boolean;
  isClosing?: boolean;
  isFinal?: boolean;
};

export const STATUS_KEY_ERROR =
  "Key must start with a lowercase letter and use only lowercase letters, numbers, and underscores.";
export const STATUS_SORT_ORDER_ERROR = "Sort order must be a whole number 0 or greater.";

const STATUS_KEY_PATTERN = /^[a-z][a-z0-9_]*$/;
const STATUS_MUTATION_FIELDS = [
  "category",
  "key",
  "labelZh",
  "labelEn",
  "sortOrder",
  "color",
  "isActive",
  "isClosing",
  "isFinal",
] as const satisfies readonly (keyof StatusMutationPayload)[];

export function createBlankStatusForm(category: CoordinatorStatusCategory): StatusFormState {
  return {
    id: null,
    category,
    key: "",
    labelZh: "",
    labelEn: "",
    sortOrder: "0",
    color: "blue",
    isActive: true,
    isSystem: false,
    isClosing: false,
    isFinal: false,
  };
}

export function statusToStatusForm(status: CoordinatorStatus): StatusFormState {
  return {
    id: status.id,
    category: status.category,
    key: status.key,
    labelZh: status.labelZh,
    labelEn: status.labelEn,
    sortOrder: String(status.sortOrder),
    color: status.color,
    isActive: status.isActive,
    isSystem: status.isSystem,
    isClosing: status.isClosing,
    isFinal: status.isFinal,
  };
}

export function parseStatusSortOrder(value: string) {
  const trimmedValue = value.trim();
  if (!trimmedValue) return null;

  const parsed = Number(trimmedValue);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function normalizeStatusForm(form: StatusFormState): StatusMutationPayload | null {
  const sortOrder = parseStatusSortOrder(form.sortOrder);
  if (sortOrder === null) return null;

  return {
    category: form.category,
    key: form.key.trim(),
    labelZh: form.labelZh.trim(),
    labelEn: form.labelEn.trim(),
    sortOrder,
    color: form.color,
    isActive: form.isActive,
    isClosing: form.isClosing,
    isFinal: form.isFinal,
  };
}

export function buildStatusMutationPayload(
  form: StatusFormState,
  original?: StatusFormState | null,
): StatusMutationPayload | null {
  const payload = normalizeStatusForm(form);
  if (!payload) return null;
  if (!original) return payload;

  const originalPayload = normalizeStatusForm(original);
  if (!originalPayload) return payload;

  const changedPayload: StatusMutationPayload = {};
  for (const field of STATUS_MUTATION_FIELDS) {
    if (payload[field] !== originalPayload[field]) {
      changedPayload[field] = payload[field] as never;
    }
  }

  return Object.keys(changedPayload).length > 0 ? changedPayload : null;
}

export function getStatusFormErrors(form: StatusFormState) {
  const errors: Partial<Record<"key" | "labelZh" | "labelEn" | "sortOrder", string>> = {};
  const key = form.key.trim();

  if (key && !STATUS_KEY_PATTERN.test(key)) {
    errors.key = STATUS_KEY_ERROR;
  }
  if (!key) {
    errors.key = "Key is required.";
  }
  if (!form.labelZh.trim()) {
    errors.labelZh = "Chinese label is required.";
  }
  if (!form.labelEn.trim()) {
    errors.labelEn = "English label is required.";
  }
  if (parseStatusSortOrder(form.sortOrder) === null) {
    errors.sortOrder = STATUS_SORT_ORDER_ERROR;
  }

  return errors;
}
