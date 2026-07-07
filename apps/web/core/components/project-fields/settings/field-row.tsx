/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Archive, Pencil, Plus, X } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { EProjectIssueFieldType, type TProjectIssueField } from "@plane/types";
import { Input } from "@plane/ui";
// hooks
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  field: TProjectIssueField;
  onEdit: () => void;
};

const FIELD_TYPE_LABELS: Record<EProjectIssueFieldType, string> = {
  [EProjectIssueFieldType.SINGLE_SELECT]: "Single select",
  [EProjectIssueFieldType.MULTI_SELECT]: "Multi select",
  [EProjectIssueFieldType.SINGLE_MEMBER]: "Single member",
  [EProjectIssueFieldType.MULTI_MEMBER]: "Multi member",
  [EProjectIssueFieldType.DATE]: "Date",
  [EProjectIssueFieldType.DATE_RANGE]: "Date range",
  [EProjectIssueFieldType.PLAIN_TEXT]: "Plain text",
};

const isOptionField = (fieldType: EProjectIssueFieldType) =>
  fieldType === EProjectIssueFieldType.SINGLE_SELECT || fieldType === EProjectIssueFieldType.MULTI_SELECT;

export const ProjectFieldRow = observer(function ProjectFieldRow(props: Props) {
  const { workspaceSlug, projectId, field, onEdit } = props;
  // states
  const [optionValue, setOptionValue] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  // store hooks
  const { updateField, createOption, deleteOption } = useProjectIssueFields();

  const handleDisable = async () => {
    try {
      setIsUpdating(true);
      await updateField(workspaceSlug, projectId, field.id, { is_disabled: true });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Field disabled",
        message: "Field has been moved to disabled fields.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Field could not be disabled. Please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateOption = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const value = optionValue.trim();
    if (!value) return;

    try {
      setIsUpdating(true);
      await createOption(workspaceSlug, projectId, field.id, value);
      setOptionValue("");
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Option could not be added. Please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDeleteOption = async (optionId: string) => {
    try {
      setIsUpdating(true);
      await deleteOption(workspaceSlug, projectId, field.id, optionId);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Option could not be deleted. Please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="grid grid-cols-[minmax(0,1fr)_9rem_7rem] items-center gap-4">
        <div className="min-w-0">
          <div className="truncate text-body-sm-medium text-primary">{field.name}</div>
          {field.description && (
            <div className="mt-0.5 truncate text-body-xs-regular text-tertiary">{field.description}</div>
          )}
        </div>
        <div className="text-body-xs-regular text-secondary">{FIELD_TYPE_LABELS[field.field_type]}</div>
        <div className="flex items-center justify-end gap-1">
          <Tooltip tooltipContent="Edit field">
            <Button variant="ghost" size="sm" onClick={onEdit} aria-label="Edit field" disabled={isUpdating}>
              <Pencil className="size-3.5" />
            </Button>
          </Tooltip>
          <Tooltip tooltipContent="Disable field">
            <Button variant="ghost" size="sm" onClick={handleDisable} aria-label="Disable field" disabled={isUpdating}>
              <Archive className="size-3.5" />
            </Button>
          </Tooltip>
        </div>
      </div>
      {isOptionField(field.field_type) && (
        <div className="mt-3 flex flex-col gap-2 rounded-sm bg-surface-2 px-3 py-2">
          <div className="flex flex-wrap gap-1.5">
            {field.options.length === 0 ? (
              <span className="text-caption-md-regular text-tertiary">No options</span>
            ) : (
              field.options.map((option) => (
                <span
                  key={option.id}
                  className="inline-flex max-w-full items-center gap-1 rounded-sm border border-subtle bg-surface-1 px-2 py-1 text-caption-md-regular text-secondary"
                >
                  <span className="truncate">{option.value}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteOption(option.id)}
                    disabled={isUpdating}
                    aria-label={`Delete ${option.value}`}
                    className="rounded-sm text-tertiary hover:text-danger-primary disabled:cursor-not-allowed disabled:text-disabled"
                  >
                    <X className="size-3" />
                  </button>
                </span>
              ))
            )}
          </div>
          <form onSubmit={handleCreateOption} className="flex items-center gap-2">
            <Input
              value={optionValue}
              onChange={(event) => setOptionValue(event.target.value)}
              placeholder="Add option"
              inputSize="xs"
              className="max-w-64"
            />
            <Button
              variant="secondary"
              size="sm"
              type="submit"
              prependIcon={<Plus />}
              disabled={isUpdating || !optionValue.trim()}
            >
              Add
            </Button>
          </form>
        </div>
      )}
    </div>
  );
});
