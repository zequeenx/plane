/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { Archive, Pencil, Plus, X } from "lucide-react";
import { observer } from "mobx-react";
// plane imports
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { Tooltip } from "@plane/propel/tooltip";
import { EProjectIssueFieldType, type TModuleIssueField } from "@plane/types";
import { AlertModalCore, Input } from "@plane/ui";
// hooks
import { useModuleIssueFields } from "@/hooks/store/use-module-issue-fields";

type Props = {
  workspaceSlug: string;
  projectId: string;
  moduleId: string;
  field: TModuleIssueField;
  onEdit: () => void;
  readOnly?: boolean;
};

const FIELD_TYPE_LABEL_KEYS: Record<EProjectIssueFieldType, string> = {
  [EProjectIssueFieldType.SINGLE_SELECT]: "project_settings.fields.field_types.single_select",
  [EProjectIssueFieldType.MULTI_SELECT]: "project_settings.fields.field_types.multi_select",
  [EProjectIssueFieldType.SINGLE_MEMBER]: "project_settings.fields.field_types.single_member",
  [EProjectIssueFieldType.MULTI_MEMBER]: "project_settings.fields.field_types.multi_member",
  [EProjectIssueFieldType.DATE]: "project_settings.fields.field_types.date",
  [EProjectIssueFieldType.DATE_RANGE]: "project_settings.fields.field_types.date_range",
  [EProjectIssueFieldType.PLAIN_TEXT]: "project_settings.fields.field_types.plain_text",
};

const isOptionField = (fieldType: EProjectIssueFieldType) =>
  fieldType === EProjectIssueFieldType.SINGLE_SELECT || fieldType === EProjectIssueFieldType.MULTI_SELECT;

export const ModuleFieldRow = observer(function ModuleFieldRow(props: Props) {
  const { workspaceSlug, projectId, moduleId, field, onEdit, readOnly = false } = props;
  // states
  const [optionValue, setOptionValue] = useState("");
  const [isUpdating, setIsUpdating] = useState(false);
  const [selectedOptionId, setSelectedOptionId] = useState<string | null>(null);
  // translation
  const { t } = useTranslation();
  // store hooks
  const { updateField, createOption, deleteOption } = useModuleIssueFields();
  // derived values
  const selectedOption = field.options.find((option) => option.id === selectedOptionId);

  const handleDisable = async () => {
    try {
      setIsUpdating(true);
      await updateField(workspaceSlug, projectId, moduleId, field.id, { is_disabled: true });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("project_module.fields.toasts.disabled.success.title"),
        message: t("project_module.fields.toasts.disabled.success.message"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("project_module.fields.toasts.disabled.error.message"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleCreateOption = async () => {
    const value = optionValue.trim();
    if (!value) return;

    try {
      setIsUpdating(true);
      await createOption(workspaceSlug, projectId, moduleId, field.id, value);
      setOptionValue("");
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("project_module.fields.toasts.option_created.error.message"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const handleOptionKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== "Enter") return;

    event.preventDefault();
    handleCreateOption();
  };

  const handleDeleteOption = async () => {
    if (!selectedOptionId) return;

    try {
      setIsUpdating(true);
      await deleteOption(workspaceSlug, projectId, moduleId, field.id, selectedOptionId);
      setSelectedOptionId(null);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("common.error.label"),
        message: t("project_module.fields.toasts.option_deleted.error.message"),
      });
    } finally {
      setIsUpdating(false);
    }
  };

  return (
    <>
      {!readOnly && (
        <AlertModalCore
          handleClose={() => setSelectedOptionId(null)}
          handleSubmit={handleDeleteOption}
          isSubmitting={isUpdating}
          isOpen={!!selectedOptionId}
          primaryButtonText={{
            default: t("common.delete"),
            loading: t("common.deleting"),
          }}
          secondaryButtonText={t("common.cancel")}
          title={t("project_module.fields.options.delete_modal.title")}
          content={
            <>
              {t("project_module.fields.options.delete_modal.description_prefix")}{" "}
              <span className="font-medium text-primary">{selectedOption?.value}</span>?{" "}
              {t("project_module.fields.options.delete_modal.description_suffix")}
            </>
          }
        />
      )}
      <div className="px-4 py-3">
        <div
          className={
            readOnly
              ? "grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-4"
              : "grid grid-cols-[minmax(0,1fr)_8rem_6rem] items-center gap-4"
          }
        >
          <div className="min-w-0">
            <div className="truncate text-body-sm-medium text-primary">{field.name}</div>
            {field.description && (
              <div className="mt-0.5 truncate text-body-xs-regular text-tertiary">{field.description}</div>
            )}
          </div>
          <div className="text-body-xs-regular text-secondary">{t(FIELD_TYPE_LABEL_KEYS[field.field_type])}</div>
          {!readOnly && (
            <div className="flex items-center justify-end gap-1">
              <Tooltip tooltipContent={t("project_module.fields.actions.edit_field")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={onEdit}
                  aria-label={t("project_module.fields.actions.edit_field")}
                  disabled={isUpdating}
                >
                  <Pencil className="size-3.5" />
                </Button>
              </Tooltip>
              <Tooltip tooltipContent={t("project_module.fields.actions.disable_field")}>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleDisable}
                  aria-label={t("project_module.fields.actions.disable_field")}
                  disabled={isUpdating}
                >
                  <Archive className="size-3.5" />
                </Button>
              </Tooltip>
            </div>
          )}
        </div>
        {isOptionField(field.field_type) && (
          <div className="mt-3 flex flex-col gap-2 rounded-sm bg-surface-2 px-3 py-2">
            <div className="flex flex-wrap gap-1.5">
              {field.options.length === 0 ? (
                <span className="text-caption-md-regular text-tertiary">
                  {t("project_module.fields.options.no_options")}
                </span>
              ) : (
                field.options.map((option) => (
                  <span
                    key={option.id}
                    className="inline-flex max-w-full items-center gap-1 rounded-sm border border-subtle bg-surface-1 px-2 py-1 text-caption-md-regular text-secondary"
                  >
                    <span className="truncate">{option.value}</span>
                    {!readOnly && (
                      <Tooltip
                        tooltipContent={t("project_module.fields.options.delete_option_aria_label", {
                          option: option.value,
                        })}
                      >
                        <button
                          type="button"
                          onClick={() => setSelectedOptionId(option.id)}
                          disabled={isUpdating}
                          aria-label={t("project_module.fields.options.delete_option_aria_label", {
                            option: option.value,
                          })}
                          className="rounded-sm text-tertiary hover:text-danger-primary disabled:cursor-not-allowed disabled:text-disabled"
                        >
                          <X className="size-3" />
                        </button>
                      </Tooltip>
                    )}
                  </span>
                ))
              )}
            </div>
            {!readOnly && (
              <div className="flex items-center gap-2">
                <Input
                  value={optionValue}
                  onChange={(event) => setOptionValue(event.target.value)}
                  onKeyDown={handleOptionKeyDown}
                  placeholder={t("project_module.fields.options.add_option")}
                  aria-label={t("project_module.fields.options.add_option_aria_label")}
                  inputSize="xs"
                  className="max-w-64"
                />
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCreateOption}
                  prependIcon={<Plus />}
                  disabled={isUpdating || !optionValue.trim()}
                >
                  {t("common.add")}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
});
