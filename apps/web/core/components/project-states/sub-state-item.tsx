/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
import { Loader } from "lucide-react";
import { CloseIcon, EditIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { ISubState, TStateOperationsCallbacks } from "@plane/types";
import { AlertModalCore } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { SubStateForm } from "./sub-state-form";

type TSubStateItemProps = {
  stateId: string;
  subState: ISubState;
  disabled: boolean;
  updateSubState: TStateOperationsCallbacks["updateSubState"];
  deleteSubState: TStateOperationsCallbacks["deleteSubState"];
};

const getStringMessage = (value: unknown): string | undefined => {
  if (typeof value === "string") {
    const message = value.trim();
    return message.length > 0 ? message : undefined;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const message = getStringMessage(item);
      if (message) return message;
    }
  }

  return undefined;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const getSubStateErrorMessage = (error: unknown, fallback: string): string => {
  const sources: unknown[] = [];

  if (isRecord(error)) {
    const response = error.response;
    if (isRecord(response)) sources.push(response.data);
    sources.push(error.data, error);
  } else {
    sources.push(error);
  }

  for (const source of sources) {
    const message = getStringMessage(source);
    if (message) return message;

    if (!isRecord(source)) continue;

    if (isRecord(source.data)) {
      const dataError = getStringMessage(source.data.error);
      if (dataError) return dataError;
    }

    const directError = getStringMessage(source.error);
    if (directError) return directError;

    const nameError = getStringMessage(source.name);
    if (nameError) return nameError;

    for (const value of Object.values(source)) {
      const fieldMessage = getStringMessage(value);
      if (fieldMessage) return fieldMessage;
    }
  }

  return fallback;
};

export const SubStateItem = observer(function SubStateItem(props: TSubStateItemProps) {
  const { stateId, subState, disabled, updateSubState, deleteSubState } = props;
  // states
  const [isEditing, setIsEditing] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleUpdate = async (formData: Partial<ISubState>) => {
    setIsSubmitting(true);

    try {
      await updateSubState(stateId, subState.id, formData);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: "Sub-state updated successfully.",
      });
      setIsEditing(false);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: getSubStateErrorMessage(error, "Sub-state could not be updated. Please try again."),
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async () => {
    setIsDeleting(true);

    try {
      await deleteSubState(stateId, subState.id);
      setIsDeleteModalOpen(false);
    } catch (error) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: getSubStateErrorMessage(error, "Sub-state could not be deleted. Please try again."),
      });
    } finally {
      setIsDeleting(false);
    }
  };

  if (isEditing)
    return (
      <SubStateForm
        data={subState}
        onSubmit={handleUpdate}
        onCancel={() => setIsEditing(false)}
        buttonDisabled={isSubmitting}
        buttonTitle={isSubmitting ? "Updating" : "Update"}
      />
    );

  return (
    <>
      <AlertModalCore
        handleClose={() => setIsDeleteModalOpen(false)}
        handleSubmit={handleDelete}
        isSubmitting={isDeleting}
        isOpen={isDeleteModalOpen}
        title="Delete Sub-state"
        content={
          <>
            Are you sure you want to delete sub-state <span className="font-medium text-primary">{subState.name}</span>?
            This action cannot be undone.
          </>
        }
      />

      <div className="group/sub-state flex items-center justify-between gap-2 rounded-sm px-2 py-1.5 hover:bg-layer-1">
        <div className="flex min-w-0 items-center gap-2">
          <div
            className="flex h-6 max-w-40 shrink-0 items-center gap-1 rounded-sm px-2 text-11 font-medium text-white"
            style={{ backgroundColor: subState.color }}
          >
            {subState.icon && <span className="shrink-0">{subState.icon}</span>}
            <span className="truncate">{subState.name}</span>
          </div>
          <span className="shrink-0 text-11 text-tertiary">Order {subState.sequence}</span>
        </div>

        {!disabled && (
          <div className="pointer-events-none flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-focus-within/sub-state:pointer-events-auto group-focus-within/sub-state:opacity-100 group-hover/sub-state:pointer-events-auto group-hover/sub-state:opacity-100">
            <button
              type="button"
              aria-label={`Edit sub-state ${subState.name}`}
              title={`Edit sub-state ${subState.name}`}
              className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-secondary transition-colors hover:bg-layer-2 hover:text-primary"
              onClick={() => setIsEditing(true)}
            >
              <EditIcon className="h-3 w-3" />
            </button>
            <button
              type="button"
              aria-label={`Delete sub-state ${subState.name}`}
              title={`Delete sub-state ${subState.name}`}
              className={cn(
                "flex h-5 w-5 cursor-pointer items-center justify-center rounded-sm text-danger-primary transition-colors hover:bg-layer-2",
                isDeleting && "cursor-not-allowed text-secondary"
              )}
              disabled={isDeleting}
              onClick={() => setIsDeleteModalOpen(true)}
            >
              {isDeleting ? <Loader className="h-3.5 w-3.5" /> : <CloseIcon className="h-3.5 w-3.5" />}
            </button>
          </div>
        )}
      </div>
    </>
  );
});
