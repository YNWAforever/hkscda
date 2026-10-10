export type OperationActivity = {
  id: string;
  title: string;
  starts_at: string;
  capacity: number;
  group_headcount: number;
  roles: { key: string; label: string }[];
};
export type OperationGroup = {
  id: string;
  activity_id: string;
  headcount: number;
  status: "pending" | "confirmed" | "cancelled";
  revision: number;
  contact_snapshot: {
    organisation: string;
    contact_name: string;
    contact_email: string;
    contact_phone: string;
  };
};
export type OperationRegistration = {
  id: string;
  activity_id: string;
  contact_name: string;
  status: string;
  duty_role: string;
  updated_at: string;
};
export type OperationListing = {
  staff: boolean;
  activities: OperationActivity[];
  enquiries: {
    id: string;
    organisation: string;
    contact_name: string;
    participant_count: number | null;
  }[];
  requests: OperationGroup[];
  registrations: OperationRegistration[];
};
export type OperationPreviewData = {
  terms_version_id?: string;
  destination_policy_version_id?: string;
  terms_body?: string;
  consent_required?: boolean;
  preview_id: string;
  apply_action: "group_apply" | "move_apply";
  manifest: {
    volunteer_capacity?: number;
    group_headcount?: number;
    scenario?: string;
    capacity?: number;
    remaining?: number;
  };
  late?: boolean;
  contact_snapshot?: OperationGroup["contact_snapshot"];
};
