import { Save } from "lucide-react";
import type { FormEvent } from "react";

import type {
  AnimalInternalProfile,
  AnimalPositionRecord,
  ArrivalSourceRecord,
  CoordinatorStatus,
  CoordinatorTask,
} from "../../../lib/adoptions/types";
import { Button } from "../../ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../../ui/dialog";
import { Input } from "../../ui/input";
import { Label } from "../../ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../ui/select";
import { Switch } from "../../ui/switch";
import { Textarea } from "../../ui/textarea";
import { useAdminCopy } from "../i18n/copy";
import { animalPipelineCopy } from "./animalPipelineCopy";
import { TaskPanel, TaskPanelAsyncError } from "./TaskPanel";

type NullableBooleanSelect = "unknown" | "yes" | "no";
const BOOLEAN_SELECT_VALUES = ["unknown", "yes", "no"] as const;

function nullableBooleanToSelect(value: boolean | null): NullableBooleanSelect {
  if (value === true) return "yes";
  if (value === false) return "no";
  return "unknown";
}

function selectToNullableBoolean(value: string) {
  if (value === "yes") return true;
  if (value === "no") return false;
  return null;
}

function ProfileFieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="text-xs text-[var(--color-error)]">
      {message}
    </p>
  );
}

export type AnimalProfileDialogProps = {
  open: boolean;
  /** The animal's name for the title, once its row is known. */
  animalName: string | null;
  /** The form being edited, or null before a profile has been opened. */
  profileForm: AnimalInternalProfile | null;
  sourceOptions: Array<Pick<ArrivalSourceRecord, "id" | "name_zh" | "name_en">>;
  positionOptions: Array<Pick<AnimalPositionRecord, "id" | "name" | "type">>;
  saving: boolean;
  saveError: string | null;
  onFieldChange: <K extends keyof AnimalInternalProfile>(
    key: K,
    value: AnimalInternalProfile[K],
  ) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onRequestClose: () => void;
  animalId: string | null;
  tasks: CoordinatorTask[];
  statuses: CoordinatorStatus[];
  tasksError: string | null;
  onTasksChanged: () => Promise<void>;
};

/** The internal profile of one animal, edited in a dialog above the pipeline. */
export function AnimalProfileDialog({
  open,
  animalName,
  profileForm,
  sourceOptions,
  positionOptions,
  saving,
  saveError,
  onFieldChange,
  onSubmit,
  onRequestClose,
  animalId,
  tasks,
  statuses,
  tasksError,
  onTasksChanged,
}: AnimalProfileDialogProps) {
  const copy = useAdminCopy(animalPipelineCopy);
  const dialog = copy.dialog;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onRequestClose()}>
      <DialogContent className="max-h-[86vh] max-w-4xl overflow-y-auto border-[var(--color-border)] bg-[var(--color-surface)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--color-panel)]">
            {dialog.title(animalName)}
          </DialogTitle>
          <DialogDescription className="text-[var(--color-text-muted)]">
            {dialog.description}
          </DialogDescription>
        </DialogHeader>

        {profileForm && (
          <>
            <form className="space-y-5" onSubmit={onSubmit}>
              <section className="grid gap-4 md:grid-cols-3">
                <div className="grid gap-2">
                  <Label htmlFor="internal-code">{dialog.internalCode}</Label>
                  <Input
                    id="internal-code"
                    value={profileForm.internal_code ?? ""}
                    onChange={(event) => onFieldChange("internal_code", event.target.value)}
                    placeholder={dialog.internalCodePlaceholder}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="arrival-date">{dialog.arrivalDate}</Label>
                  <Input
                    id="arrival-date"
                    type="date"
                    className="h-11"
                    value={profileForm.arrival_date ?? ""}
                    onChange={(event) => onFieldChange("arrival_date", event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="arrival-source">{dialog.arrivalSource}</Label>
                  <Select
                    value={profileForm.arrival_source_id ?? "none"}
                    disabled={sourceOptions.length === 0}
                    onValueChange={(value) =>
                      onFieldChange("arrival_source_id", value === "none" ? null : value)
                    }
                  >
                    <SelectTrigger id="arrival-source" aria-label={dialog.arrivalSource}>
                      <SelectValue
                        placeholder={
                          sourceOptions.length === 0
                            ? dialog.noSourcesConfigured
                            : dialog.arrivalSource
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{dialog.noSource}</SelectItem>
                      {sourceOptions.map((source) => (
                        <SelectItem key={source.id} value={source.id}>
                          {copy.sourceOption(source.name_zh, source.name_en)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {sourceOptions.length === 0 && (
                    <p className="text-xs text-[var(--color-text-muted)]">{dialog.noSourcesHint}</p>
                  )}
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-[minmax(0,1fr)_160px]">
                <div className="grid gap-2">
                  <Label htmlFor="current-position">{dialog.currentPosition}</Label>
                  <Select
                    value={profileForm.current_position_id ?? "none"}
                    disabled={positionOptions.length === 0}
                    onValueChange={(value) =>
                      onFieldChange("current_position_id", value === "none" ? null : value)
                    }
                  >
                    <SelectTrigger id="current-position" aria-label={dialog.currentPosition}>
                      <SelectValue
                        placeholder={
                          positionOptions.length === 0
                            ? dialog.noPositionsConfigured
                            : dialog.currentPosition
                        }
                      />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{copy.filters.noPosition}</SelectItem>
                      {positionOptions.map((position) => (
                        <SelectItem key={position.id} value={position.id}>
                          {dialog.positionOption(position.name, position.type)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {positionOptions.length === 0 && (
                    <p className="text-xs text-[var(--color-text-muted)]">
                      {dialog.noPositionsHint}
                    </p>
                  )}
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="cage">{dialog.cage}</Label>
                  <Input
                    id="cage"
                    value={profileForm.cage ?? ""}
                    onChange={(event) => onFieldChange("cage", event.target.value)}
                    placeholder={dialog.cagePlaceholder}
                  />
                </div>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
                  <div className="grid gap-2">
                    <Label htmlFor="has-chip">{dialog.microchip}</Label>
                    <Select
                      value={nullableBooleanToSelect(profileForm.has_chip)}
                      onValueChange={(value) =>
                        onFieldChange("has_chip", selectToNullableBoolean(value))
                      }
                    >
                      <SelectTrigger id="has-chip" aria-label={dialog.microchipStatus}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {BOOLEAN_SELECT_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {copy.unknownOptions[value]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="chip-remarks">{dialog.chipRemarks}</Label>
                    <Textarea
                      id="chip-remarks"
                      value={profileForm.chip_remarks ?? ""}
                      onChange={(event) => onFieldChange("chip_remarks", event.target.value)}
                      rows={3}
                    />
                  </div>
                </div>

                <div className="space-y-3 rounded-md border border-[var(--color-border)] p-3">
                  <div className="grid gap-2 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="is-desexed">{dialog.neutered}</Label>
                      <Select
                        value={nullableBooleanToSelect(profileForm.is_desexed)}
                        onValueChange={(value) =>
                          onFieldChange("is_desexed", selectToNullableBoolean(value))
                        }
                      >
                        <SelectTrigger id="is-desexed" aria-label={dialog.neuteredStatus}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {BOOLEAN_SELECT_VALUES.map((value) => (
                            <SelectItem key={value} value={value}>
                              {copy.unknownOptions[value]}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid gap-2">
                      <Label htmlFor="desexed-at">{dialog.neuteredDate}</Label>
                      <Input
                        id="desexed-at"
                        type="date"
                        className="h-11"
                        value={profileForm.desexed_at ?? ""}
                        onChange={(event) => onFieldChange("desexed_at", event.target.value)}
                      />
                    </div>
                  </div>
                  <div className="grid gap-2">
                    <Label htmlFor="desex-remarks">{dialog.neuteredRemarks}</Label>
                    <Textarea
                      id="desex-remarks"
                      value={profileForm.desex_remarks ?? ""}
                      onChange={(event) => onFieldChange("desex_remarks", event.target.value)}
                      rows={3}
                    />
                  </div>
                </div>
              </section>

              <section className="grid gap-3 md:grid-cols-2">
                <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--color-border)] px-3">
                  <span>
                    <span className="block text-sm font-medium text-[var(--color-panel)]">
                      {dialog.adoptable}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {dialog.adoptableHint}
                    </span>
                  </span>
                  <Switch
                    checked={profileForm.is_adoptable}
                    onCheckedChange={(checked) => onFieldChange("is_adoptable", checked)}
                    aria-label={dialog.adoptable}
                  />
                </label>
                <label className="flex min-h-11 items-center justify-between gap-4 rounded-md border border-[var(--color-border)] px-3">
                  <span>
                    <span className="block text-sm font-medium text-[var(--color-panel)]">
                      {dialog.supportPool}
                    </span>
                    <span className="text-xs text-[var(--color-text-muted)]">
                      {dialog.supportPoolHint}
                    </span>
                  </span>
                  <Switch
                    checked={profileForm.is_inside_support_pool}
                    onCheckedChange={(checked) => onFieldChange("is_inside_support_pool", checked)}
                    aria-label={dialog.supportPoolSwitch}
                  />
                </label>
              </section>

              <section className="grid gap-4 md:grid-cols-2">
                <div className="grid gap-2">
                  <Label htmlFor="adopted-at">{dialog.adoptedDate}</Label>
                  <Input
                    id="adopted-at"
                    type="date"
                    className="h-11"
                    value={profileForm.adopted_at ?? ""}
                    onChange={(event) => onFieldChange("adopted_at", event.target.value)}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="deceased-at">{dialog.deceasedDate}</Label>
                  <Input
                    id="deceased-at"
                    type="date"
                    className="h-11"
                    value={profileForm.deceased_at ?? ""}
                    onChange={(event) => onFieldChange("deceased_at", event.target.value)}
                  />
                </div>
              </section>

              <section className="grid gap-2">
                <Label htmlFor="internal-remarks">{dialog.internalRemarks}</Label>
                <Textarea
                  id="internal-remarks"
                  value={profileForm.internal_remarks ?? ""}
                  onChange={(event) => onFieldChange("internal_remarks", event.target.value)}
                  rows={4}
                />
              </section>

              {saveError && <ProfileFieldError message={saveError} />}

              <DialogFooter>
                <Button type="button" variant="outline" onClick={onRequestClose} disabled={saving}>
                  {dialog.cancel}
                </Button>
                <Button type="submit" disabled={saving}>
                  <Save className="h-4 w-4" />
                  {saving ? dialog.saving : dialog.save}
                </Button>
              </DialogFooter>
            </form>

            <TaskPanel
              title={dialog.tasksTitle}
              subtitle={dialog.tasksSubtitle}
              tasks={tasks}
              statuses={statuses}
              defaultLinks={{ animalId: animalId ?? undefined }}
              onChanged={onTasksChanged}
            />
            {tasksError && <TaskPanelAsyncError message={tasksError} />}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
