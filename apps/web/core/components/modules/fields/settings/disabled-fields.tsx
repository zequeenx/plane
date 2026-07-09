/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { RotateCcw, Trash2 } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import type { TModuleIssueField } from "@plane/types";
import { AlertModalCore, Loader } from "@plane/ui";
// hooks
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  moduleId: string;
  fields: TModuleIssueField[];
  isLoading: boolean;
  readOnly?: boolean;
};

export const DisabledModuleFields = observer(function DisabledModuleFields(props: Props) {
  const { workspaceSlug, projectId, moduleId, fields, isLoading, readOnly = false } = props;
  // states
  const [selectedField, setSelectedField] = useState<TModuleIssueField | null>(null);
  const [isUpdating, setIsUpdating] = useState(false);
  // translation
  const { t } = useTranslation();
  // store hooks
  const { updateField, deleteField } = useModuleIssueFields();

  const handleRestore = async (field: TModuleIssueField) => {
    try {
      setIsUpdating(true);
      await updateField(workspaceSlug, projectId, moduleId, field.id, { is_disabled: false });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project_module.fields.toasts.restored.success.title"),
        message: t("project_module.fields.toasts.restored.success.message"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("project_module.fields.toasts.restored.error.message"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedField) return;

    try {
      setIsUpdating(true);
      await deleteField(workspaceSlug, projectId, moduleId, selectedField.id);
      setSelectedField(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project_module.fields.toasts.deleted.success.title"),
        message: t("project_module.fields.toasts.deleted.success.message"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("project_module.fields.toasts.deleted.error.message"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  if (isLoading) {
    return (
      <div className="mt-5">
        <div className="mb-3 text-body-sm-medium text-primary">{t("project_module.fields.disabled.heading")}</div>
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
      {!readOnly && (
        <AlertModalCore
          handleClose={() => setSelectedField(null)}
          handleSubmit={handleDelete}
          isSubmitting={isUpdating}
          isOpen={!!selectedField}
          primaryButtonText={{
            default: t("common.delete"),
            loading: t("common.deleting"),
          }}
          secondaryButtonText={t("common.cancel")}
          title={t("project_module.fields.delete_modal.title")}
          content={
            <>
              {t("project_module.fields.delete_modal.description_prefix")}{" "}
              <span className="font-medium text-primary">{selectedField?.name}</span>?{" "}
              {t("project_module.fields.delete_modal.description_suffix")}
            </>
          }
        />
      )}
      <div className="mt-5">
        <div className="mb-3">
          <h3 className="text-body-sm-medium text-primary">{t("project_module.fields.disabled.heading")}</h3>
          <p className="text-body-xs-regular text-tertiary">{t("project_module.fields.disabled.description")}</p>
        </div>
        <div className="overflow-hidden rounded-sm border border-subtle">
          <div className="divide-y divide-subtle">
            {fields.map((field) => (
              <div
                key={field.id}
                className={
                  readOnly
                    ? "grid grid-cols-[minmax(0,1fr)] items-center gap-4 px-4 py-3"
                    : "grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-4 px-4 py-3"
                }
              >
                <div className="min-w-0">
                  <div className="truncate text-body-sm-medium text-primary">{field.name}</div>
                  {field.description && (
                    <div className="mt-0.5 truncate text-body-xs-regular text-tertiary">{field.description}</div>
                  )}
                </div>
                {!readOnly && (
                  <div className="flex items-center justify-end gap-1">
                    <Tooltip tooltipContent={t("project_module.fields.actions.restore_field")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => handleRestore(field)}
                        aria-label={t("project_module.fields.actions.restore_field")}
                        disabled={isUpdating}
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                    </Tooltip>
                    <Tooltip tooltipContent={t("project_module.fields.actions.delete_field")}>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => setSelectedField(field)}
                        aria-label={t("project_module.fields.actions.delete_field")}
                        disabled={isUpdating}
                      >
                        <Trash2 className="size-3.5 text-danger-primary" />
                      </Button>
                    </Tooltip>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
});
