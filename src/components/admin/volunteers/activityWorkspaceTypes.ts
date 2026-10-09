import type { BulkOperation } from "./activityOperationCopy";

/** One activity as the workspace list reads it. */
export type Row = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string;
  status: string;
  capacity: number;
  template_key: string | null;
  shelter_key: string | null;
  policy_version_id: string | null;
  policy_revision: number;
  updated_at: string;
  scenario: string | null;
  approved: number;
  waitlisted: number;
  shortages: { role: string; missing: number }[];
  registrations_closed_at: string | null;
};
export type Item = Partial<Row> & {
  date: string;
  template_key: string;
  item_key: string;
  state: string;
  preview: {
    kind: string;
    reason?: string;
    after?: { title: string; starts_at: string; shelter_key: string; capacity: number };
    issues?: string[];
    registrations?: { kind: string; reason?: string }[];
  };
  result?: { kind: string };
};
export type Group = { index: number; date: string; state: string; reason?: string; items: Item[] };
export type OperationNotification = {
  id: string;
  kind: string;
  queue_status: string;
  follow_up: string;
  completed_at: string | null;
  provider_message_id: string | null;
};
export type Operation = {
  notifications?: OperationNotification[];
  id: string;
  action: string;
  selection: Row[];
  groups: Group[];
  created_at: string;
  expires_at: string;
};
export type Template = {
  template_key: string;
  name: string;
  version_id: string;
  shelter: string;
  start_time: string;
  end_time: string;
};
export type Reply = { kind: string; operation: Operation };

/** One activity's detail, read when staff open it. */
export type ActivityDetail = {
  activity: Row & { description: string | null };
  registrations: {
    id: string;
    contact_name: string;
    status: string;
    attendance_status: string;
  }[];
  total: number;
  history_total: number;
  history: { id: string; action: string; created_at: string }[];
};

/** What staff chose and typed for the operation they are about to preview. */
export type OperationDraft = {
  mode: BulkOperation;
  template: string;
  templateKeys: string[];
  from: string;
  until: string;
  weekdays: number[];
  excluded: string;
  reason: string;
  title: string;
  description: string;
  attendance: string;
  correction: boolean;
};
