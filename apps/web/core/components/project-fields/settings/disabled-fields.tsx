/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TProjectIssueField } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
// hooks
import { useProjectIssueFields } from "@/hooks/store/use-project-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  fields: TProjectIssueField[];
  isLoading: boolean;
};

export const DisabledProjectFields = observer(function DisabledProjectFields(props: Props) {
  const { workspaceSlug, projectId, fields, isLoading } = props;
  // states
  const [selectedField, setSelectedField] = useState<TProjectIssueField | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  // store hooks
  const { updateField, deleteField } = useProjectIssueFields();

  const handleRestore = async (field: TProjectIssueField) => {
    try {
      setIsUpdating(true);
      await updateField(workspaceSlug, projectId, field.id, { is_disabled: false });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Field restored",
        message: "Field is available on work items again.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Field could not be restored. Please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedField) return;

    try {
      setIsUpdating(true);
      await deleteField(workspaceSlug, projectId, selectedField.id);
      setSelectedField(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Field deleted",
        message: "Field has been permanently deleted.",
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error",
        message: "Field could not be deleted. Please try again.",
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mt-8">
        <div className="mb-3 text-body-sm-medium text-primary">Disabled fields</div>
        <Loader className="space-y-2">
          <Loader.Item height="44px" />
          <Loader.Item height="44px" />
        </Loader>
      </div>
    );
  }

  if (fields.length === 0) return null;

  return (
    <>
      <AlertModalCore
        handleClose={() => setSelectedField(null)}
        handleSubmit={handleDelete}
        isSubmitting={isUpdating}
        isOpen={!!selectedField}
        title="Delete field"
        content={
          <>
            Permanently delete <span className="font-medium text-primary">{selectedField?.name}</span>? This cannot be
            undone.
          </>
        }
      />
      <div className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-body-sm-medium text-primary">Disabled fields</h3>
            <p className="text-body-xs-regular text-tertiary">Restore fields or delete them permanently.</p>
          </div>
        </div>
        <div className="overflow-hidden rounded-sm border border-subtle">
          <div className="divide-y divide-subtle">
            {fields.map((field) => (
              <div key={field.id} className="grid grid-cols-[minmax(0,1fr)_7rem] items-center gap-4 px-4 py-3">
                <div className="min-w-0">
                  <div className="truncate text-body-sm-medium text-primary">{field.name}</div>
                  {field.description && (
                    <div className="mt-0.5 truncate text-body-xs-regular text-tertiary">{field.description}</div>
                  )}
                </div>
                <div className="flex items-center justify-end gap-1">
                  <Tooltip tooltipContent="Restore field">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRestore(field)}
                      aria-label="Restore field"
                      disabled={isUpdating}
                    >
                      <RotateCcw className="size-3.5" />
                    </Button>
                  </Tooltip>
                  <Tooltip tooltipContent="Delete field">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setSelectedField(field)}
                      aria-label="Delete field"
                      disabled={isUpdating}
                    >
                      <Trash2 className="size-3.5 text-danger-primary" />
                    </Button>
                  </Tooltip>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
});
