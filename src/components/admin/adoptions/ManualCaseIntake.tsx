import { useMutation, useQuery } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";

import type {
  CoordinatorStatus,
  CoordinatorTaskContactChannel,
  CoordinatorTaskPriority,
  ManualCaseIdentityCandidate,
} from "../../../lib/adoptions/types";
import { Badge } from "../../ui/badge";
import { Button } from "../../ui/button";
import { Checkbox } from "../../ui/checkbox";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Textarea } from "../../ui/textarea";
import { fetchCoordinatorJson } from "./api";
import {
  buildIdentitySearchParams,
  buildManualCasePayload,
  type ManualAdopterProfileForm,
  type ManualCaseForm,
  type ManualCaseIdentityForm,
  type ManualInitialTaskForm,
  type ManualSupporterForm,
} from "./manualIntakeLogic";

type StatusesResponse = {
  statuses: CoordinatorStatus[];
};

type IdentitySearchResponse = {
  candidates: ManualCaseIdentityCandidate[];
  total: number;
};

type ManualCaseCreateResponse = {
  case: {
    id: string;
  };
  supporterId: string;
  adopterProfileId: string;
  taskId: string | null;
};

type IdentityMode = ManualCaseIdentityForm["kind"];

const ANIMAL_TYPE_OPTIONS = [
  { value: "cat", label: "Cat" },
  { value: "dog", label: "Dog" },
] as const;

const PRIORITY_OPTIONS: Array<{ value: CoordinatorTaskPriority; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
];

const CONTACT_CHANNEL_OPTIONS: Array<{ value: CoordinatorTaskContactChannel; label: string }> = [
  { value: "phone", label: "Phone" },
  { value: "whatsapp", label: "WhatsApp" },
  { value: "email", label: "Email" },
  { value: "in_person", label: "In person" },
  { value: "internal", label: "Internal" },
];

const CASE_STATUS_ENDPOINT = "/api/admin/adoptions/statuses?category=adoption_case";
const FOLLOWUP_STATUS_ENDPOINT = "/api/admin/adoptions/statuses?category=followup";
const INTAKE_CASES_ENDPOINT = "/api/admin/adoptions/intake/cases";

function emptyCaseForm(): ManualCaseForm {
  return {
    initialStatusId: "",
    requestedAnimalId: "",
    animalType: "cat",
    applicantName: "",
    applicantPhone: "",
    applicantEmail: "",
    applicantAddress: "",
    housingType: "",
    familySize: "",
    existingPets: "",
    reason: "",
    preferenceNotes: "",
  };
}

function emptySupporterForm(): ManualSupporterForm {
  return {
    name: "",
    phone: "",
    email: "",
    language: "zh-HK",
  };
}

function emptyAdopterProfileForm(): ManualAdopterProfileForm {
  return {
    nameEnglish: "",
    nameChinese: "",
    address: "",
    householdSize: "",
  };
}

function emptyInitialTaskForm(): ManualInitialTaskForm {
  return {
    enabled: false,
    statusId: "",
    title: "",
    taskType: "followup",
    priority: "normal",
    dueAt: "",
    assignedTo: "",
    volunteer: "",
    contactChannel: "",
    remarks: "",
  };
}

function FormSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <div className="border-b border-[var(--color-border)] px-4 py-3">
        <h2 className="text-base font-semibold text-[var(--color-panel)]">{title}</h2>
        {subtitle && <p className="text-xs text-[var(--color-text-muted)]">{subtitle}</p>}
      </div>
      <div className="space-y-4 p-4">{children}</div>
    </section>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-[var(--color-panel)]">
        {label}
      </Label>
      {children}
    </div>
  );
}

function InlineAlert({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-md border border-[var(--color-error)] bg-[var(--color-surface-2)] px-3 py-2 text-sm text-[var(--color-error)]"
    >
      {children}
    </div>
  );
}

function statusLabel(status: CoordinatorStatus | undefined) {
  if (!status) return "Not selected";
  return status.labelZh || status.labelEn || status.key;
}

function activeStatuses(statuses: CoordinatorStatus[] | undefined) {
  return (statuses ?? []).filter((status) => status.isActive);
}

function CandidateBadge({ candidate }: { candidate: ManualCaseIdentityCandidate }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Badge
        variant="outline"
        className="border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-panel)]"
      >
        {candidate.kind === "adopter" ? "Adopter profile" : "Supporter"}
      </Badge>
      {candidate.isBlacklisted && (
        <Badge
          variant="outline"
          className="border-[var(--color-error)] bg-[var(--color-surface-2)] text-[var(--color-error)]"
        >
          Blacklisted
        </Badge>
      )}
    </div>
  );
}

function StatusSelect({
  id,
  statuses,
  value,
  onChange,
  placeholder,
  disabled,
}: {
  id: string;
  statuses: CoordinatorStatus[];
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  disabled?: boolean;
}) {
  return (
    <Select value={value} onValueChange={onChange} disabled={disabled || statuses.length === 0}>
      <SelectTrigger id={id} className="h-9">
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {statuses.map((status) => (
          <SelectItem key={status.id} value={status.id}>
            {status.labelZh} / {status.labelEn}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function ReviewItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
      <div className="text-xs font-medium text-[var(--color-text-muted)]">{label}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--color-panel)]">{value}</div>
    </div>
  );
}

function displayCandidateContact(candidate: ManualCaseIdentityCandidate) {
  const parts = [candidate.phone, candidate.email].filter(Boolean);
  return parts.length ? parts.join(" · ") : "No contact on file";
}

export function ManualCaseIntake() {
  const navigate = useNavigate();
  const [identitySearch, setIdentitySearch] = useState("");
  const [identityMode, setIdentityMode] = useState<IdentityMode>("new_supporter");
  const [selectedCandidate, setSelectedCandidate] = useState<ManualCaseIdentityCandidate | null>(
    null,
  );
  const [existingSupporterId, setExistingSupporterId] = useState("");
  const [existingAdopterProfileId, setExistingAdopterProfileId] = useState("");
  const [supporterForm, setSupporterForm] = useState<ManualSupporterForm>(emptySupporterForm);
  const [adopterProfileForm, setAdopterProfileForm] =
    useState<ManualAdopterProfileForm>(emptyAdopterProfileForm);
  const [caseForm, setCaseForm] = useState<ManualCaseForm>(emptyCaseForm);
  const [initialTask, setInitialTask] = useState<ManualInitialTaskForm>(emptyInitialTaskForm);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const searchText = identitySearch.trim();
  const identitySearchParams = useMemo(
    () => buildIdentitySearchParams({ q: searchText }),
    [searchText],
  );

  const caseStatusesQuery = useQuery<StatusesResponse, Error>({
    queryKey: ["manual-intake-statuses", "adoption_case"],
    queryFn: () => fetchCoordinatorJson<StatusesResponse>(CASE_STATUS_ENDPOINT),
  });

  const followupStatusesQuery = useQuery<StatusesResponse, Error>({
    queryKey: ["manual-intake-statuses", "followup"],
    queryFn: () => fetchCoordinatorJson<StatusesResponse>(FOLLOWUP_STATUS_ENDPOINT),
    enabled: initialTask.enabled,
  });

  const identitySearchQuery = useQuery<IdentitySearchResponse, Error>({
    queryKey: ["manual-intake-identity-search", identitySearchParams.toString()],
    queryFn: () =>
      fetchCoordinatorJson<IdentitySearchResponse>(
        `/api/admin/adoptions/intake/identity-search?${identitySearchParams}`,
      ),
    enabled: searchText.length > 0,
  });

  const createCaseMutation = useMutation<ManualCaseCreateResponse, Error, ManualCaseIdentityForm>({
    mutationFn: (identity) =>
      fetchCoordinatorJson<ManualCaseCreateResponse>(INTAKE_CASES_ENDPOINT, {
        method: "POST",
        body: JSON.stringify(
          buildManualCasePayload({
            identity,
            caseForm,
            initialTask: initialTask.enabled ? initialTask : undefined,
          }),
        ),
      }),
    onSuccess: (result) => {
      void navigate({ to: "/admin/applications/$id", params: { id: result.case.id } });
    },
  });

  const caseStatuses = useMemo(
    () => activeStatuses(caseStatusesQuery.data?.statuses),
    [caseStatusesQuery.data?.statuses],
  );
  const followupStatuses = useMemo(
    () => activeStatuses(followupStatusesQuery.data?.statuses),
    [followupStatusesQuery.data?.statuses],
  );
  const identityCandidates = identitySearchQuery.data?.candidates ?? [];
  const selectedCaseStatus = caseStatuses.find((status) => status.id === caseForm.initialStatusId);
  const selectedTaskStatus = followupStatuses.find((status) => status.id === initialTask.statusId);

  useEffect(() => {
    if (caseForm.initialStatusId || !caseStatuses[0]) return;
    setCaseForm((current) => ({ ...current, initialStatusId: caseStatuses[0].id }));
  }, [caseForm.initialStatusId, caseStatuses]);

  useEffect(() => {
    if (!initialTask.enabled || initialTask.statusId || !followupStatuses[0]) return;
    setInitialTask((current) => ({ ...current, statusId: followupStatuses[0].id }));
  }, [followupStatuses, initialTask.enabled, initialTask.statusId]);

  function updateSupporterField<K extends keyof ManualSupporterForm>(
    key: K,
    value: ManualSupporterForm[K],
  ) {
    setSupporterForm((current) => ({ ...current, [key]: value }));
  }

  function updateAdopterProfileField<K extends keyof ManualAdopterProfileForm>(
    key: K,
    value: ManualAdopterProfileForm[K],
  ) {
    setAdopterProfileForm((current) => ({ ...current, [key]: value }));
  }

  function updateCaseField<K extends keyof ManualCaseForm>(key: K, value: ManualCaseForm[K]) {
    setCaseForm((current) => ({ ...current, [key]: value }));
  }

  function updateTaskField<K extends keyof ManualInitialTaskForm>(
    key: K,
    value: ManualInitialTaskForm[K],
  ) {
    setInitialTask((current) => ({ ...current, [key]: value }));
  }

  function selectCandidate(candidate: ManualCaseIdentityCandidate) {
    setSelectedCandidate(candidate);
    setSubmitError(null);
    setCaseForm((current) => ({
      ...current,
      applicantName: current.applicantName || candidate.displayName,
      applicantPhone: current.applicantPhone || candidate.phone || "",
      applicantEmail: current.applicantEmail || candidate.email || "",
    }));

    if (candidate.kind === "adopter" && candidate.adopterProfileId) {
      setIdentityMode("existing_adopter");
      setExistingAdopterProfileId(candidate.adopterProfileId);
      setExistingSupporterId(candidate.supporterId ?? "");
      return;
    }

    if (candidate.supporterId) {
      setIdentityMode("existing_supporter");
      setExistingSupporterId(candidate.supporterId);
      setExistingAdopterProfileId("");
    }
  }

  function useNewSupporter() {
    setIdentityMode("new_supporter");
    setSelectedCandidate(null);
    setExistingSupporterId("");
    setExistingAdopterProfileId("");
    setSubmitError(null);
    setSupporterForm((current) => ({
      ...current,
      name: current.name || searchText,
    }));
  }

  function buildIdentity(): ManualCaseIdentityForm | null {
    if (identityMode === "existing_adopter") {
      return existingAdopterProfileId
        ? { kind: "existing_adopter", adopterProfileId: existingAdopterProfileId }
        : null;
    }

    if (identityMode === "existing_supporter") {
      return existingSupporterId
        ? {
            kind: "existing_supporter",
            supporterId: existingSupporterId,
            adopterProfile: adopterProfileForm,
          }
        : null;
    }

    return {
      kind: "new_supporter",
      supporter: supporterForm,
      adopterProfile: adopterProfileForm,
    };
  }

  function validateIdentity(identity: ManualCaseIdentityForm | null) {
    if (!identity) return "Search and select an existing identity, or create a new supporter.";
    if (identity.kind === "new_supporter") {
      if (!supporterForm.name.trim()) return "Enter the new supporter's name.";
      if (!supporterForm.phone.trim()) return "Enter the new supporter's phone number.";
    }
    return null;
  }

  function validateForm(identity: ManualCaseIdentityForm | null) {
    const identityError = validateIdentity(identity);
    if (identityError) return identityError;
    if (!caseForm.initialStatusId) return "Choose an initial case status.";
    if (!caseForm.animalType.trim()) return "Choose an animal type.";
    if (!caseForm.applicantName.trim()) return "Enter the applicant name.";
    if (!caseForm.applicantPhone.trim()) return "Enter the applicant phone number.";
    if (initialTask.enabled && !initialTask.statusId) return "Choose a follow-up task status.";
    if (initialTask.enabled && !initialTask.title.trim()) return "Enter the follow-up task title.";
    return null;
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const identity = buildIdentity();
    const validationError = validateForm(identity);
    setSubmitError(validationError);
    createCaseMutation.reset();
    if (validationError || !identity) return;
    createCaseMutation.mutate(identity);
  }

  const identityReview =
    identityMode === "new_supporter"
      ? supporterForm.name.trim() || "New supporter"
      : selectedCandidate?.displayName || "Existing identity";
  const submitFailure = submitError ?? createCaseMutation.error?.message;
  const isSubmitting = createCaseMutation.isPending;

  return (
    <form className="space-y-5 p-6" onSubmit={handleSubmit}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-panel)]">Manual case intake</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Create adoption cases from phone, WhatsApp, or walk-in requests.
          </p>
        </div>
        <Button type="submit" disabled={isSubmitting || caseStatuses.length === 0}>
          {isSubmitting ? "Creating..." : "Create case"}
        </Button>
      </div>

      {caseStatusesQuery.error && (
        <InlineAlert>
          Could not load adoption case statuses: {caseStatusesQuery.error.message}
        </InlineAlert>
      )}
      {followupStatusesQuery.error && initialTask.enabled && (
        <InlineAlert>
          Could not load follow-up task statuses: {followupStatusesQuery.error.message}
        </InlineAlert>
      )}
      {submitFailure && <InlineAlert>{submitFailure}</InlineAlert>}

      <FormSection
        title="Identity"
        subtitle="Search existing adopters or supporters before creating a new supporter record."
      >
        <div className="grid gap-3 lg:grid-cols-[minmax(260px,1fr)_auto]">
          <Field id="manual-intake-identity-search" label="Search name, phone, email, or address">
            <Input
              id="manual-intake-identity-search"
              value={identitySearch}
              onChange={(event) => setIdentitySearch(event.target.value)}
              className="h-9"
              placeholder="Type to search existing records"
            />
          </Field>
          <div className="flex items-end">
            <Button type="button" variant="outline" onClick={useNewSupporter}>
              Create new supporter
            </Button>
          </div>
        </div>

        {identitySearchQuery.error && searchText && (
          <InlineAlert>
            Could not search identities: {identitySearchQuery.error.message}
          </InlineAlert>
        )}

        {searchText && (
          <div className="rounded-md border border-[var(--color-border)]">
            <div className="flex min-h-11 items-center justify-between border-b border-[var(--color-border)] px-3">
              <div className="text-sm font-medium text-[var(--color-panel)]">Search results</div>
              <div className="text-xs text-[var(--color-text-muted)]">
                {identitySearchQuery.isFetching
                  ? "Searching..."
                  : `${identitySearchQuery.data?.total ?? 0} matches`}
              </div>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {!identitySearchQuery.isFetching && identityCandidates.length === 0 && (
                <div className="px-3 py-3 text-sm text-[var(--color-text-muted)]">
                  No existing identity matched this search.
                </div>
              )}
              {identityCandidates.map((candidate) => (
                <Button
                  key={`${candidate.kind}-${candidate.adopterProfileId ?? candidate.supporterId}`}
                  type="button"
                  variant="ghost"
                  className="h-auto w-full justify-between rounded-none px-3 py-3 text-left whitespace-normal"
                  onClick={() => selectCandidate(candidate)}
                >
                  <span>
                    <span className="block font-medium text-[var(--color-panel)]">
                      {candidate.displayName}
                    </span>
                    <span className="block text-xs font-normal text-[var(--color-text-muted)]">
                      {displayCandidateContact(candidate)}
                    </span>
                  </span>
                  <CandidateBadge candidate={candidate} />
                </Button>
              ))}
            </div>
          </div>
        )}

        <div className="grid gap-3 lg:grid-cols-3">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 lg:col-span-1">
            <div className="text-xs font-medium text-[var(--color-text-muted)]">
              Current identity
            </div>
            <div className="mt-1 text-sm font-semibold text-[var(--color-panel)]">
              {identityReview}
            </div>
            <div className="mt-2">
              <Badge
                variant="outline"
                className="border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-panel)]"
              >
                {identityMode.replace("_", " ")}
              </Badge>
            </div>
          </div>

          {identityMode === "new_supporter" && (
            <div className="grid gap-3 lg:col-span-2 md:grid-cols-2">
              <Field id="manual-supporter-name" label="Supporter name">
                <Input
                  id="manual-supporter-name"
                  value={supporterForm.name}
                  onChange={(event) => updateSupporterField("name", event.target.value)}
                  className="h-9"
                />
              </Field>
              <Field id="manual-supporter-phone" label="Supporter phone">
                <Input
                  id="manual-supporter-phone"
                  value={supporterForm.phone}
                  onChange={(event) => updateSupporterField("phone", event.target.value)}
                  className="h-9"
                />
              </Field>
              <Field id="manual-supporter-email" label="Supporter email">
                <Input
                  id="manual-supporter-email"
                  value={supporterForm.email ?? ""}
                  onChange={(event) => updateSupporterField("email", event.target.value)}
                  className="h-9"
                  type="email"
                />
              </Field>
              <Field id="manual-supporter-language" label="Language">
                <Select
                  value={supporterForm.language ?? "zh-HK"}
                  onValueChange={(value) =>
                    updateSupporterField("language", value as ManualSupporterForm["language"])
                  }
                >
                  <SelectTrigger id="manual-supporter-language" className="h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="zh-HK">Chinese</SelectItem>
                    <SelectItem value="en">English</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}
        </div>

        {identityMode !== "existing_adopter" && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field id="manual-adopter-name-en" label="Adopter English name">
              <Input
                id="manual-adopter-name-en"
                value={adopterProfileForm.nameEnglish ?? ""}
                onChange={(event) => updateAdopterProfileField("nameEnglish", event.target.value)}
                className="h-9"
              />
            </Field>
            <Field id="manual-adopter-name-zh" label="Adopter Chinese name">
              <Input
                id="manual-adopter-name-zh"
                value={adopterProfileForm.nameChinese ?? ""}
                onChange={(event) => updateAdopterProfileField("nameChinese", event.target.value)}
                className="h-9"
              />
            </Field>
            <Field id="manual-adopter-address" label="Adopter address">
              <Input
                id="manual-adopter-address"
                value={adopterProfileForm.address ?? ""}
                onChange={(event) => updateAdopterProfileField("address", event.target.value)}
                className="h-9"
              />
            </Field>
            <Field id="manual-adopter-household-size" label="Household size">
              <Input
                id="manual-adopter-household-size"
                value={adopterProfileForm.householdSize ?? ""}
                onChange={(event) => updateAdopterProfileField("householdSize", event.target.value)}
                className="h-9"
              />
            </Field>
          </div>
        )}
      </FormSection>

      <FormSection
        title="Case details"
        subtitle="Required fields mirror the public application record."
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <Field id="manual-case-status" label="Initial status">
            <StatusSelect
              id="manual-case-status"
              statuses={caseStatuses}
              value={caseForm.initialStatusId}
              onChange={(value) => updateCaseField("initialStatusId", value)}
              placeholder={caseStatusesQuery.isLoading ? "Loading..." : "Choose status"}
            />
          </Field>
          <Field id="manual-animal-type" label="Animal type">
            <Select
              value={caseForm.animalType}
              onValueChange={(value) => updateCaseField("animalType", value)}
            >
              <SelectTrigger id="manual-animal-type" className="h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {ANIMAL_TYPE_OPTIONS.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field id="manual-applicant-name" label="Applicant name">
            <Input
              id="manual-applicant-name"
              value={caseForm.applicantName}
              onChange={(event) => updateCaseField("applicantName", event.target.value)}
              className="h-9"
            />
          </Field>
          <Field id="manual-applicant-phone" label="Applicant phone">
            <Input
              id="manual-applicant-phone"
              value={caseForm.applicantPhone}
              onChange={(event) => updateCaseField("applicantPhone", event.target.value)}
              className="h-9"
            />
          </Field>
          <Field id="manual-applicant-email" label="Applicant email">
            <Input
              id="manual-applicant-email"
              value={caseForm.applicantEmail ?? ""}
              onChange={(event) => updateCaseField("applicantEmail", event.target.value)}
              className="h-9"
              type="email"
            />
          </Field>
          <Field id="manual-requested-animal-id" label="Requested animal ID">
            <Input
              id="manual-requested-animal-id"
              value={caseForm.requestedAnimalId ?? ""}
              onChange={(event) => updateCaseField("requestedAnimalId", event.target.value)}
              className="h-9"
              placeholder="Optional UUID"
            />
          </Field>
          <Field id="manual-housing-type" label="Housing type">
            <Input
              id="manual-housing-type"
              value={caseForm.housingType ?? ""}
              onChange={(event) => updateCaseField("housingType", event.target.value)}
              className="h-9"
            />
          </Field>
          <Field id="manual-family-size" label="Family size">
            <Input
              id="manual-family-size"
              value={caseForm.familySize ?? ""}
              onChange={(event) => updateCaseField("familySize", event.target.value)}
              className="h-9"
              min={1}
              type="number"
            />
          </Field>
        </div>
        <div className="grid gap-3 lg:grid-cols-2">
          <Field id="manual-applicant-address" label="Applicant address">
            <Textarea
              id="manual-applicant-address"
              value={caseForm.applicantAddress ?? ""}
              onChange={(event) => updateCaseField("applicantAddress", event.target.value)}
              className="min-h-20"
            />
          </Field>
          <Field id="manual-existing-pets" label="Existing pets">
            <Textarea
              id="manual-existing-pets"
              value={caseForm.existingPets ?? ""}
              onChange={(event) => updateCaseField("existingPets", event.target.value)}
              className="min-h-20"
            />
          </Field>
          <Field id="manual-reason" label="Reason">
            <Textarea
              id="manual-reason"
              value={caseForm.reason ?? ""}
              onChange={(event) => updateCaseField("reason", event.target.value)}
              className="min-h-20"
            />
          </Field>
          <Field id="manual-preference-notes" label="Preference notes">
            <Textarea
              id="manual-preference-notes"
              value={caseForm.preferenceNotes ?? ""}
              onChange={(event) => updateCaseField("preferenceNotes", event.target.value)}
              className="min-h-20"
            />
          </Field>
        </div>
      </FormSection>

      <FormSection
        title="Optional task"
        subtitle="Create the first coordinator follow-up together with the case."
      >
        <label className="flex h-9 items-center gap-2 rounded-md border border-[var(--color-border)] px-3 text-sm text-[var(--color-panel)]">
          <Checkbox
            checked={initialTask.enabled}
            onCheckedChange={(checked) => updateTaskField("enabled", checked === true)}
            aria-label="Create an initial follow-up task"
          />
          Create initial follow-up task
        </label>

        {initialTask.enabled && (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <Field id="manual-task-status" label="Task status">
              <StatusSelect
                id="manual-task-status"
                statuses={followupStatuses}
                value={initialTask.statusId}
                onChange={(value) => updateTaskField("statusId", value)}
                placeholder={followupStatusesQuery.isLoading ? "Loading..." : "Choose status"}
                disabled={followupStatusesQuery.isLoading}
              />
            </Field>
            <Field id="manual-task-title" label="Task title">
              <Input
                id="manual-task-title"
                value={initialTask.title}
                onChange={(event) => updateTaskField("title", event.target.value)}
                className="h-9"
              />
            </Field>
            <Field id="manual-task-priority" label="Priority">
              <Select
                value={initialTask.priority}
                onValueChange={(value) =>
                  updateTaskField("priority", value as CoordinatorTaskPriority)
                }
              >
                <SelectTrigger id="manual-task-priority" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITY_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="manual-task-due-at" label="Due at">
              <Input
                id="manual-task-due-at"
                value={initialTask.dueAt ?? ""}
                onChange={(event) => updateTaskField("dueAt", event.target.value)}
                className="h-9"
                type="datetime-local"
              />
            </Field>
            <Field id="manual-task-assigned-to" label="Assigned to">
              <Input
                id="manual-task-assigned-to"
                value={initialTask.assignedTo ?? ""}
                onChange={(event) => updateTaskField("assignedTo", event.target.value)}
                className="h-9"
              />
            </Field>
            <Field id="manual-task-volunteer" label="Volunteer">
              <Input
                id="manual-task-volunteer"
                value={initialTask.volunteer ?? ""}
                onChange={(event) => updateTaskField("volunteer", event.target.value)}
                className="h-9"
              />
            </Field>
            <Field id="manual-task-channel" label="Contact channel">
              <Select
                value={initialTask.contactChannel || "none"}
                onValueChange={(value) =>
                  updateTaskField(
                    "contactChannel",
                    value === "none" ? "" : (value as CoordinatorTaskContactChannel),
                  )
                }
              >
                <SelectTrigger id="manual-task-channel" className="h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No channel</SelectItem>
                  {CONTACT_CHANNEL_OPTIONS.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field id="manual-task-type" label="Task type">
              <Input
                id="manual-task-type"
                value={initialTask.taskType ?? ""}
                onChange={(event) => updateTaskField("taskType", event.target.value)}
                className="h-9"
              />
            </Field>
            <div className="md:col-span-2 xl:col-span-4">
              <Field id="manual-task-remarks" label="Remarks">
                <Textarea
                  id="manual-task-remarks"
                  value={initialTask.remarks ?? ""}
                  onChange={(event) => updateTaskField("remarks", event.target.value)}
                  className="min-h-20"
                />
              </Field>
            </div>
          </div>
        )}
      </FormSection>

      <FormSection title="Review">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <ReviewItem label="Identity" value={identityReview} />
          <ReviewItem label="Case status" value={statusLabel(selectedCaseStatus)} />
          <ReviewItem
            label="Applicant"
            value={caseForm.applicantName.trim() || "Applicant name missing"}
          />
          <ReviewItem
            label="Initial task"
            value={initialTask.enabled ? statusLabel(selectedTaskStatus) : "No task"}
          />
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSubmitError(null);
              createCaseMutation.reset();
            }}
          >
            Clear alert
          </Button>
          <Button type="submit" disabled={isSubmitting || caseStatuses.length === 0}>
            {isSubmitting ? "Creating..." : "Create case"}
          </Button>
        </div>
      </FormSection>
    </form>
  );
}
